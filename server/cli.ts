/** `scintle <command>`: the entry point hooks, slash commands and the developer use. */

import { join } from 'node:path';
import { dataDir, transcriptRoots } from './lib/config.ts';
import { discover, ingestFile } from './ingest/index.ts';
import { extractAll, sessionsToExtract } from './extract/run.ts';
import { lineageReport } from './report.ts';
import { buildBrief } from './brief.ts';
import { linkPlans } from './returnpath.ts';
import { ensure, postFromHook, request, running, stop } from './daemon.ts';
import { purgeDeleted, setConsent } from './store/upkeep.ts';
import { execFile } from 'node:child_process';
import { openDb, type Db } from './store/db.ts';
import { resetInferred } from './store/ledger.ts';

const dbPath = (): string => join(dataDir(), 'scintle.db');
const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

function ingestAll(db: Db, dryRun: boolean): void {
  const files = discover(transcriptRoots());
  const totals = { files: files.length, ingested: 0, unchanged: 0, empty: 0, lines: 0, malformed: 0, abandoned: 0 };
  const turns: Record<string, number> = {};
  const parsers: Record<string, number> = {};
  const unknown: Record<string, number> = {};
  for (const f of files) {
    const o = ingestFile(db, f, { dryRun });
    totals[o.status]++;
    const r = o.result;
    if (r === undefined) continue;
    totals.lines += r.stats.lines;
    totals.malformed += r.stats.malformed;
    totals.abandoned += r.stats.abandoned;
    const key = `${r.parser} ${r.match}`;
    parsers[key] = (parsers[key] ?? 0) + 1;
    for (const [k, n] of Object.entries(r.stats.unknown)) unknown[k] = (unknown[k] ?? 0) + n;
    for (const t of r.turns) turns[t.role] = (turns[t.role] ?? 0) + 1;
  }
  console.log(JSON.stringify({ ...totals, turns, parsers, unknownTypes: unknown }, null, 2));
}

async function importCmd(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  if (!dryRun && (await running()) !== undefined) {
    console.error('The Scintle server is running and extracts live sessions itself. Run /scintle:stop first, or this import may read the same session twice.');
    process.exitCode = 1;
    return;
  }
  const db = openDb(dryRun ? ':memory:' : dbPath());
  if (args.includes('--fresh')) resetInferred(db);
  // Running an import is the person's go-ahead to read.
  if (!dryRun) setConsent(db, true);
  ingestAll(db, dryRun);
  if (dryRun) return;
  purgeDeleted(db);
  for (const { id } of db.prepare('SELECT id FROM sessions').all() as { id: string }[]) linkPlans(db, id);
  if (args.includes('--no-extract')) return;

  const limit = Number(flag(args, '--limit') ?? Infinity);
  const only = flag(args, '--session');
  const ids = only !== undefined ? [only] : sessionsToExtract(db).slice(0, limit);
  const model = flag(args, '--model');
  const r = await extractAll(db, ids, {
    ...(model !== undefined ? { model } : {}),
    onSegment: (s, done, total) => {
      console.log(`[${done}/${total}] ${s.sessionId.slice(0, 8)} ideas+${s.ideas} events+${s.events}${s.question ? ' question' : ''}` +
        (s.dropped.length > 0 ? ` dropped=${s.dropped.length}` : '') + (s.error ? ` ERROR ${s.error}` : ''));
      for (const d of s.dropped) console.log(`    dropped: ${d}`);
    },
  });
  console.log(`${r.calls} model calls${r.stopped ? ` · stopped: ${r.stopped}` : ''}`);
}

/** Claude Code hook: stdin carries the event. Silent, and always exits 0. */
async function hookCmd(): Promise<void> {
  if (process.env['SCINTLE_DISABLE'] === '1') return;
  try {
    let raw = '';
    for await (const c of process.stdin) raw += c;
    const h = JSON.parse(raw) as { hook_event_name?: string; transcript_path?: string };
    await postFromHook('/api/hook', { event: h.hook_event_name, transcript_path: h.transcript_path });
  } catch {
    // Principle: a broken Scintle never breaks a session.
  }
}

async function openCmd(): Promise<void> {
  const s = await ensure();
  if (s === undefined) {
    console.log('Scintle could not start. See ~/.local/share/scintle/scintled.log');
    return;
  }
  const url = `${s.url}/?t=${s.token}`;
  if (process.platform === 'darwin') execFile('open', [url]);
  console.log(`Scintle board: ${s.url}`);
}

const [cmd = '', ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'hook':
    await hookCmd();
    break;
  case 'open':
    await openCmd();
    break;
  case 'sync': {
    const r = (await request('/api/sync')) as { sessions?: number } | undefined;
    console.log(r?.sessions === undefined ? 'Scintle could not start.' : r.sessions === 0
      ? 'Nothing waiting: every session is already read.'
      : `Reading ${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'} now. The board updates as each one finishes.`);
    break;
  }
  case 'ensure':
    console.log((await ensure())?.url ?? 'not running');
    break;
  case 'stop':
    console.log((await stop()) ? 'Scintle stopped.' : 'Scintle was not running.');
    break;
  case 'brief': {
    const b = buildBrief(openDb(dbPath()), (rest[0] ?? '').toUpperCase());
    console.log(b?.body ?? `No idea ${rest[0] ?? ''}. Open the board with /scintle to find its id.`);
    break;
  }
  case 'import':
    await importCmd(rest);
    break;
  case 'ideas':
    console.log(lineageReport(openDb(dbPath())));
    break;
  default:
    console.error('usage: scintle open | sync | ensure | stop | hook | brief <I-001> | ideas\n       scintle import [--dry-run] [--fresh] [--no-extract] [--limit N] [--session ID] [--model M]');
    process.exitCode = 2;
}
