/** Model-call accounting and the purge that keeps Scintle from becoming a transcript archive (D5). */

import { existsSync } from 'node:fs';
import type { Db } from './db.ts';

export const DAILY_CALL_CAP = Number(process.env['SCINTLE_DAILY_CALLS'] ?? 200);

type CallResult = { error: string } | { inputTokens: number; outputTokens: number; durationMs: number };

export function recordCall(db: Db, kind: 'extract' | 'research' | 'ask' | 'logo', r: CallResult): void {
  const ok = !('error' in r);
  db.prepare('INSERT INTO calls (ts, kind, ok, input_tokens, output_tokens, duration_ms) VALUES (?, ?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), kind, ok ? 1 : 0, ok ? r.inputTokens : 0, ok ? r.outputTokens : 0, ok ? r.durationMs : 0);
}

/** Today's calls with the tokens and time they used. */
export function usageToday(db: Db): { calls: number; inputTokens: number; outputTokens: number; minutes: number } {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const r = db.prepare('SELECT COUNT(*) AS n, SUM(input_tokens) AS i, SUM(output_tokens) AS o, SUM(duration_ms) AS d FROM calls WHERE ts >= ?')
    .get(midnight.toISOString()) as { n: number; i: number | null; o: number | null; d: number | null };
  return { calls: r.n, inputTokens: r.i ?? 0, outputTokens: r.o ?? 0, minutes: Math.round((r.d ?? 0) / 6000) / 10 };
}

/** Calls since local midnight. */
export function callsToday(db: Db): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return (db.prepare('SELECT COUNT(*) AS n FROM calls WHERE ts >= ?').get(midnight.toISOString()) as { n: number }).n;
}

/** Drop turn text once Claude Code has deleted the transcript. Event quotes and excerpts stay. */
export function purgeDeleted(db: Db): number {
  const live = db.prepare("SELECT id, transcript_path FROM sessions WHERE source_state = 'live'").all() as { id: string; transcript_path: string }[];
  let purged = 0;
  for (const s of live) {
    if (existsSync(s.transcript_path)) continue;
    db.prepare('DELETE FROM turns WHERE session_id = ?').run(s.id);
    db.prepare("UPDATE sessions SET source_state = 'deleted' WHERE id = ?").run(s.id);
    purged++;
  }
  return purged;
}

/** Model reads only run after the person says so, once, on the board (D21). */
export function consented(db: Db): boolean {
  const r = db.prepare("SELECT value FROM meta WHERE key = 'consent'").get() as { value: number } | undefined;
  return r?.value === 1;
}

export function setConsent(db: Db, on: boolean): void {
  db.prepare("INSERT INTO meta (key, value) VALUES ('consent', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(on ? 1 : 0);
}

/** "Only new sessions": treat everything already on disk as read, so no backfill is spent. */
export function skipHistory(db: Db): void {
  db.exec('UPDATE sessions SET turns_extracted = (SELECT COALESCE(MAX(seq), -1) FROM turns WHERE turns.session_id = sessions.id)');
}
