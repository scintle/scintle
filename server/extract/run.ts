/**
 * Extraction driver. Segments from every waiting session are read in one queue ordered by time, so an
 * idea is born before anything in a parallel session refers to it (D19). A session's cursor moves only
 * after its segment is applied; a failed segment stops that session until the next trigger.
 */

import type { Db } from '../store/db.ts';
import { callModel, type ModelReply } from '../lib/model.ts';
import { callsToday, DAILY_CALL_CAP, recordCall } from '../store/upkeep.ts';
import { applyExtraction } from './apply.ts';
import { buildPrompt } from './prompt.ts';
import { EXTRACTION_SCHEMA, sanitize } from './schema.ts';
import { pendingTurns, segments, type SegTurn } from './segment.ts';

type Call = (prompt: string, schema: object) => Promise<ModelReply<unknown> | { error: string }>;
export type SegmentRun = { sessionId: string; ideas: number; events: number; dropped: string[]; question: boolean; error?: string };
type RunSummary = { calls: number; segments: SegmentRun[]; stopped?: string };

function markExtracted(db: Db, sessionId: string, seq: number): void {
  db.prepare('UPDATE sessions SET turns_extracted = MAX(turns_extracted, ?) WHERE id = ?').run(seq, sessionId);
}

/** Sessions with unextracted turns, oldest first. */
export function sessionsToExtract(db: Db): string[] {
  return (db.prepare(
    `SELECT s.id FROM sessions s WHERE EXISTS (SELECT 1 FROM turns t WHERE t.session_id = s.id AND t.seq > s.turns_extracted)
     ORDER BY s.started_at`,
  ).all() as { id: string }[]).map((r) => r.id);
}

export async function extractAll(
  db: Db,
  ids: string[] = sessionsToExtract(db),
  opts: { model?: string; call?: Call; onSegment?: (r: SegmentRun, done: number, total: number) => void } = {},
): Promise<RunSummary> {
  const call: Call = opts.call ?? ((p, s) => callModel<unknown>(p, s, opts.model === undefined ? {} : { model: opts.model }));
  const pending = new Map(ids.map((id) => [id, pendingTurns(db, id)]));
  const queue = [...pending].flatMap(([id, turns]) => segments(turns).map((seg) => ({ id, seg, at: seg.find((t) => t.ts)?.ts ?? '' })));
  queue.sort((a, b) => a.at.localeCompare(b.at));

  const summary: RunSummary = { calls: 0, segments: [] };
  const failed = new Set<string>();
  for (const [n, { id, seg }] of queue.entries()) {
    if (failed.has(id)) continue;
    if (callsToday(db) >= DAILY_CALL_CAP) {
      summary.stopped = `daily cap of ${DAILY_CALL_CAP} model calls reached; resumes tomorrow`;
      return summary;
    }
    const project = (db.prepare('SELECT project FROM sessions WHERE id = ?').get(id) as { project: string | null } | undefined)?.project ?? null;
    summary.calls++;
    const reply = await call(buildPrompt(db, project, seg, id), EXTRACTION_SCHEMA);
    if (opts.call === undefined) recordCall(db, 'extract', reply);
    let r: SegmentRun;
    if ('error' in reply) {
      failed.add(id);
      r = { sessionId: id, ideas: 0, events: 0, dropped: [], question: false, error: reply.error };
    } else {
      r = { sessionId: id, ...applyExtraction(db, id, seg, sanitize(reply.output)) };
      markExtracted(db, id, (seg.at(-1) as SegTurn).seq);
    }
    summary.segments.push(r);
    opts.onSegment?.(r, n + 1, queue.length);
  }
  // Trailing turns with no human words still count as read.
  for (const [id, turns] of pending) {
    const last = turns.at(-1)?.seq;
    if (!failed.has(id) && last !== undefined) markExtracted(db, id, last);
  }
  return summary;
}
