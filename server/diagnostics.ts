/** "Copy diagnostics": what a bug report needs, and never an idea, a quote or a path. */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { billedTo } from './lib/model.ts';
import { dataDir } from './lib/config.ts';
import { redact } from './lib/redact.ts';
import type { Db } from './store/db.ts';
import { DAILY_CALL_CAP, usageToday } from './store/upkeep.ts';

const claudeVersion = (): Promise<string> =>
  new Promise((done) => execFile('claude', ['--version'], { timeout: 3000 }, (err, out) => done(err ? 'not found' : out.trim())));

function pluginVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: string }).version ?? '?';
  } catch {
    return '?';
  }
}

/** A line with secrets and anything path-like removed. */
const clean = (l: string): string => redact(l).text.replaceAll(homedir(), '~').replace(/(?:~|\/)[^\s'"]*\//g, '…/').slice(0, 200);

/** Error lines from the server log, cleaned. */
export function recentErrors(log: string, n = 5): string[] {
  return log.split('\n').filter((l) => /error|fail|exception/i.test(l)).slice(-n).map(clean);
}

export async function diagnostics(db: Db, readError: string | null): Promise<string> {
  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  let log = '';
  try {
    log = readFileSync(join(dataDir(), 'scintled.log'), 'utf8').slice(-200_000);
  } catch {
    // No log yet.
  }
  const errors = recentErrors(log);
  return [
    `Scintle ${pluginVersion()}`,
    `OS: ${process.platform} ${process.arch}`,
    `Node: ${process.version}`,
    `Claude Code: ${await claudeVersion()}`,
    ...(billedTo() === null ? [] : [`Model calls billed to: ${billedTo()}`]),
    `Sessions: ${count("SELECT COUNT(*) AS n FROM sessions WHERE harness != 'doc'")}, documents: ${count("SELECT COUNT(*) AS n FROM sessions WHERE harness = 'doc'")}`,
    `Ideas: ${count('SELECT COUNT(*) AS n FROM ideas')}, events: ${count('SELECT COUNT(*) AS n FROM events')}`,
    `Model calls today: ${usageToday(db).calls} of ${DAILY_CALL_CAP}`,
    `Last read error: ${readError === null ? 'none' : clean(readError)}`,
    `Recent log errors:${errors.length === 0 ? ' none' : `\n  ${errors.join('\n  ')}`}`,
  ].join('\n');
}
