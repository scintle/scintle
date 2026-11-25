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
import { discoverDocs, ingestDocs } from './ingest/docs.ts';
import { execFile } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { openDb, type Db } from './store/db.ts';
import { resetInferred } from './store/ledger.ts';
import { setConsent as setTelemetry, status as telemetryStatus } from './telemetry.ts';

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
  ingestDocs(db, discoverDocs(db), true);
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
    console.log(`Scintle could not start. See ${join(dataDir(), 'scintled.log')}`);
    return;
  }
  const url = `${s.url}/?t=${s.token}`;
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : undefined;
  // No display (SSH, containers): the link below is enough.
  if (opener !== undefined) execFile(opener, [url], () => undefined);
  console.log(`Scintle board: ${s.url}`);
}

/** Deletes everything Scintle stored. Plugin uninstall leaves this folder alone (D27). */
async function forgetCmd(args: string[]): Promise<void> {
  const dir = dataDir();
  // SCINTLE_HOME could point anywhere; only delete a folder that is recognisably ours.
  if (!existsSync(join(dir, 'scintle.db')) && !existsSync(join(dir, 'token'))) {
    console.log(`Nothing to delete: ${dir} holds no Scintle data.`);
    return;
  }
  if (!args.includes('--yes') && !args.includes('yes')) {
    console.log(`This deletes ${dir}: every idea, its history and Scintle's settings. Your Claude Code sessions are not touched.\nTo delete, run /scintle:forget yes (or scintle forget --yes in a terminal).`);
    return;
  }
  await stop();
  rmSync(dir, { recursive: true, force: true });
  console.log(`Deleted ${dir}.`);
}

const WHY: Record<string, string> = {
  'not-asked': 'Off: you have not been asked yet. The board asks once.',
  declined: 'Off: you said no.',
  DO_NOT_TRACK: 'Off: DO_NOT_TRACK is set.',
  SCINTLE_TELEMETRY_DISABLED: 'Off: SCINTLE_TELEMETRY_DISABLED is set.',
  CI: 'Off: running in CI.',
  'no-endpoint': 'On, but this build has no collector address (only official releases send), so nothing is sent.',
};

function telemetryCmd(args: string[]): void {
  const sub = args[0] ?? 'status';
  if (sub === 'enable' || sub === 'disable') setTelemetry(sub === 'enable');
  else if (sub !== 'status') {
    console.error('usage: scintle telemetry status | enable | disable');
    process.exitCode = 2;
    return;
  }
  const t = telemetryStatus();
  console.log(t.blockedBy === null ? 'On: at most one anonymous message a day.' : WHY[t.blockedBy]);
  console.log(`\nThe next message would be:\n${JSON.stringify(t.next, null, 2)}`);
  console.log(t.lastPayload ? `\nLast sent ${t.lastSentAt}:\n${JSON.stringify(t.lastPayload, null, 2)}` : '\nNothing has been sent.');
  console.log('\nWhat each field means: https://scintle.github.io/scintle/trust/telemetry/');
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
  case 'add': {
    const r = (await request('/api/folders', { path: rest[0] ?? process.cwd() })) as { ok?: boolean; path?: string; error?: string } | undefined;
    console.log(r === undefined ? 'Scintle could not start.' : r.ok
      ? `Scintle now reads ${r.path}. Its plans and docs are read on the next catch-up; remove it any time from Folders on the board.`
      : `Not added: ${r.error}.`);
    break;
  }
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
  case 'telemetry':
    telemetryCmd(rest);
    break;
  case 'forget':
    await forgetCmd(rest);
    break;
  case 'ideas':
    console.log(lineageReport(openDb(dbPath())));
    break;
  default:
    console.error('usage: scintle open | sync | ensure | stop | hook | add [path] | brief <I-001> | ideas | telemetry [status|enable|disable] | forget [--yes]\n       scintle import [--dry-run] [--fresh] [--no-extract] [--limit N] [--session ID] [--model M]');
    process.exitCode = 2;
}
