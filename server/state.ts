/** The board's snapshot: everything the UI draws, in one read. Small enough at 200 ideas / 5k events. */

import { statSync } from 'node:fs';
import type { Db } from './store/db.ts';
import { DAILY_CALL_CAP, usageToday } from './store/upkeep.ts';

const RETENTION_DAYS = 30;
const DAY = 86_400_000;

type SourceState = 'live' | 'expiring' | 'deleted' | 'none';

function sourceStates(db: Db): Record<string, { state: SourceState; expiresInDays?: number; project: string | null }> {
  const rows = db.prepare('SELECT id, transcript_path, project FROM sessions').all() as { id: string; transcript_path: string; project: string | null }[];
  const out: Record<string, { state: SourceState; expiresInDays?: number; project: string | null }> = {};
  for (const r of rows) {
    try {
      // Claude Code's cleanup keys on the file's last write.
      const left = RETENTION_DAYS - Math.floor((Date.now() - statSync(r.transcript_path).mtimeMs) / DAY);
      out[r.id] = left <= 5 ? { state: 'expiring', expiresInDays: Math.max(left, 0), project: r.project } : { state: 'live', project: r.project };
    } catch {
      out[r.id] = { state: 'deleted', project: r.project };
    }
  }
  return out;
}

export function snapshot(db: Db): object {
  return {
    ideas: db.prepare('SELECT * FROM ideas ORDER BY updated_at DESC').all(),
    events: db.prepare(
      `SELECT e.*, EXISTS (SELECT 1 FROM events c WHERE c.supersedes = e.id AND c.state != 'removed') AS superseded
       FROM events e ORDER BY ts, id`,
    ).all(),
    // A link lives only as long as the event that made it.
    links: db.prepare(
      `SELECT l.* FROM links l LEFT JOIN events e ON e.id = l.event_id
       WHERE l.event_id IS NULL OR (e.state != 'removed' AND NOT EXISTS (SELECT 1 FROM events c WHERE c.supersedes = e.id AND c.state != 'removed'))`,
    ).all(),
    questions: db.prepare("SELECT * FROM questions WHERE state = 'open' ORDER BY created_at").all(),
    jobs: db.prepare('SELECT * FROM jobs ORDER BY started_at DESC LIMIT 50').all(),
    sources: sourceStates(db),
    calls: { ...usageToday(db), cap: DAILY_CALL_CAP },
    now: new Date().toISOString(),
  };
}
