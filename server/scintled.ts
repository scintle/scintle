/**
 * scintled: the one local server (context/decisions.md D6). Binds 127.0.0.1, checks a token on every
 * route, serves the board, takes hook posts, and exits after a long idle with no board open.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import * as actions from './actions.ts';
import { ask } from './ask.ts';
import { logoFor } from './logos.ts';
import { drawLogo, drawnLogoPath, forgetLogo, hasDrawnLogo } from './jobs/logo.ts';
import { saveBrief } from './brief.ts';
import { startResearch } from './jobs/research.ts';
import { dataDir } from './lib/config.ts';
import { writeAtomic, writeJson } from './lib/files.ts';
import { Live, waiting } from './live.ts';
import { snapshot } from './state.ts';
import { openDb } from './store/db.ts';
import { consented, purgeDeleted, setConsent, skipHistory } from './store/upkeep.ts';
import type { EventType } from './store/ledger.ts';

const DIR = dataDir();
const PORT = Number(process.env['SCINTLE_PORT'] ?? 4873);
const IDLE_MS = Number(process.env['SCINTLE_IDLE_MS'] ?? 6 * 3_600_000);
const WEB = join(import.meta.dirname, '..', 'web', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

const db = openDb(join(DIR, 'scintle.db'));
const token = loadToken();
const clients = new Set<ServerResponse>();
let version = 0;
let lastActivity = Date.now();

function changed(): void {
  version++;
  for (const c of clients) c.write(`data: ${JSON.stringify({ version })}\n\n`);
}
const live = new Live(db, changed);

function loadToken(): string {
  const path = join(DIR, 'token');
  if (existsSync(path)) return readFileSync(path, 'utf8').trim();
  const t = randomBytes(24).toString('base64url');
  writeAtomic(path, t);
  return t;
}

function authorized(req: IncomingMessage): boolean {
  const given = req.headers['x-scintle-token'] ?? /(?:^|;\s*)scintle=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (typeof given !== 'string' || given.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(token));
}

/** Refuse other Host headers, so a web page cannot reach us through DNS rebinding. */
function localHost(req: IncomingMessage): boolean {
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('body too large');
  }
  return raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
}

function serveStatic(res: ServerResponse, url: string): void {
  const rel = normalize(url.split('?')[0] ?? '/').replace(/^(\.\.[/\\])+/, '');
  let file = join(WEB, rel);
  if (!file.startsWith(WEB) || !existsSync(file) || rel === '/' || extname(file) === '') file = join(WEB, 'index.html');
  if (!existsSync(file)) return send(res, 503, { error: 'board not built: run npm run build in web/' });
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

type Handler = (p: { b: Record<string, unknown>; m: RegExpExecArray }) => unknown;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** An idea's own project logo wins; otherwise the one Claude drew. The query string busts the cache on redraw. */
function logos(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { id } of db.prepare('SELECT id FROM ideas').all() as { id: string }[]) {
    const own = logoFor(db, id);
    if (own) out[id] = `/api/logo/${id}?p=${statSync(own).mtimeMs}`;
    else if (hasDrawnLogo(DIR, id)) out[id] = `/api/logo/${id}?v=${statSync(drawnLogoPath(DIR, id)).mtimeMs}`;
  }
  return out;
}

let drawing = false;
/** Draw one missing logo at a time, only while nothing is being read. */
async function drawMissing(): Promise<void> {
  if (drawing || live.extracting !== undefined || !consented(db)) return;
  const missing = (db.prepare('SELECT id FROM ideas ORDER BY updated_at DESC').all() as { id: string }[])
    .map((r) => r.id).find((id) => !logoFor(db, id) && !hasDrawnLogo(DIR, id) && !failedLogos.has(id));
  if (missing === undefined) return;
  drawing = true;
  try {
    if (await drawLogo(db, DIR, missing)) changed();
    else failedLogos.add(missing);
  } finally {
    drawing = false;
  }
}
const failedLogos = new Set<string>();

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/state$/, () => ({ ...snapshot(db), version, extracting: live.extracting ?? null, waiting: waiting(db), progress: live.progress, readError: live.lastError, consent: consented(db), logos: logos() })],
  ['POST', /^\/api\/consent$/, ({ b }) => {
    const mode = str(b['mode']);
    if (mode === 'off') { setConsent(db, false); return { ok: true, sessions: 0 }; }
    setConsent(db, true);
    if (mode === 'new-only') { live.rescan(); skipHistory(db); return { ok: true, sessions: 0 }; }
    return { ok: true, sessions: live.catchUp() };
  }],
  ['POST', /^\/api\/sync$/, () => ({ ok: true, sessions: live.catchUp() })],
  ['POST', /^\/api\/sync\/dismiss$/, () => { live.lastError = null; return { ok: true }; }],
  ['POST', /^\/api\/hook$/, ({ b }) => {
    live.onHook(str(b['event']), str(b['transcript_path']));
    return { ok: true };
  }],
  ['POST', /^\/api\/ideas$/, ({ b }) => actions.newIdea(db, str(b['title']), str(b['problem']))],
  ['POST', /^\/api\/ideas\/(I-\d+)\/rename$/, ({ b, m }) => actions.renameIdea(db, m[1] as string, str(b['title']))],
  ['POST', /^\/api\/ideas\/(I-\d+)\/stage$/, ({ b, m }) => actions.moveStage(db, m[1] as string, str(b['type']) as EventType, str(b['why']))],
  ['POST', /^\/api\/ideas\/(I-\d+)\/brief$/, ({ m }) => saveBrief(db, m[1] as string) ?? { ok: false, error: 'no such idea' }],
  ['POST', /^\/api\/ideas\/(I-\d+)\/logo$/, ({ m }) => {
    const id = m[1] as string;
    forgetLogo(DIR, id);
    failedLogos.delete(id);
    void drawLogo(db, DIR, id).then(() => changed());
    return { ok: true, undo: { kind: 'none' } };
  }],
  ['POST', /^\/api\/ideas\/(I-\d+)\/research$/, ({ m }) => ({ ok: true, job: startResearch(db, DIR, m[1] as string, changed) })],
  ['POST', /^\/api\/events\/(\d+)\/confirm$/, ({ m }) => actions.confirmEvent(db, Number(m[1]))],
  ['POST', /^\/api\/events\/(\d+)\/remove$/, ({ m }) => actions.removeEvent(db, Number(m[1]))],
  ['POST', /^\/api\/events\/(\d+)\/correct$/, ({ b, m }) =>
    actions.correctEvent(db, Number(m[1]), str(b['type']) as EventType, (b['payload'] ?? {}) as Record<string, unknown>)],
  ['POST', /^\/api\/questions\/(\d+)\/answer$/, ({ b, m }) => actions.answerQuestion(db, Number(m[1]), str(b['answer']))],
  ['POST', /^\/api\/undo$/, ({ b }) => actions.undo(db, b as actions.Undo)],
  ['POST', /^\/api\/ask$/, ({ b }) => ask(db, str(b['q']).slice(0, 500))],
  ['GET', /^\/api\/brief\/(I-\d+)$/, ({ m }) => saveBrief(db, m[1] as string) ?? { ok: false, error: 'no such idea' }],
];

const server = createServer(async (req, res) => {
  if (!localHost(req)) return send(res, 403, { error: 'forbidden host' });
  const url = req.url ?? '/';
  if (url === '/health') return send(res, 200, { ok: true, pid: process.pid });

  // The board is opened once with ?t=<token>; the cookie carries it from then on.
  const t = /[?&]t=([^&]+)/.exec(url)?.[1];
  if (req.method === 'GET' && t === token) {
    res.writeHead(302, { 'set-cookie': `scintle=${token}; HttpOnly; SameSite=Strict; Path=/`, location: '/' });
    return res.end();
  }
  if (!authorized(req)) return send(res, 401, { error: 'open the board with /scintle' });
  lastActivity = Date.now();

  if (url === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ version, extracting: live.extracting ?? null })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (!url.startsWith('/api/')) return serveStatic(res, url);
  const logo = /^\/api\/logo\/(I-\d+)$/.exec(url.split('?')[0] ?? '');
  if (logo) {
    const id = logo[1] as string;
    const file = logoFor(db, id) ?? (hasDrawnLogo(DIR, id) ? drawnLogoPath(DIR, id) : undefined);
    if (!file) return send(res, 404, { error: 'no logo' });
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'max-age=600',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    return res.end(readFileSync(file));
  }

  for (const [method, re, handle] of routes) {
    const m = re.exec(url.split('?')[0] ?? '');
    if (m === null || method !== req.method) continue;
    try {
      const out = await handle({ b: req.method === 'POST' ? await body(req) : {}, m });
      if (req.method === 'POST' && !/\/(hook|brief|ask)$/.test(url)) changed();
      return send(res, 200, out);
    } catch (e) {
      return send(res, 400, { ok: false, error: (e as Error).message });
    }
  }
  send(res, 404, { error: 'not found' });
});

function listen(port: number, triesLeft: number): void {
  server.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => writeJson(join(DIR, 'server.json'), { pid: process.pid, port }));
}

function shutdown(): void {
  rmSync(join(DIR, 'server.json'), { force: true });
  db.close();
  process.exit(0);
}

setInterval(() => {
  if (purgeDeleted(db) > 0) changed();
}, 3_600_000).unref();
setInterval(() => void drawMissing(), 20_000).unref();

setInterval(() => {
  const running = (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'running'").get() as { n: number }).n;
  if (clients.size === 0 && running === 0 && live.extracting === undefined && Date.now() - lastActivity > IDLE_MS) shutdown();
  for (const c of clients) c.write(': ping\n\n');
}, 30_000).unref();

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// Jobs that were running when the last server died will never finish.
db.prepare("UPDATE jobs SET status = 'failed', error = 'server stopped' WHERE status = 'running'").run();
purgeDeleted(db);
listen(PORT, 10);
// Index transcripts at start so the board can say what a first read would cost. No model calls.
setImmediate(() => live.rescan());
