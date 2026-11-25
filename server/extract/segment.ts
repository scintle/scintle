/** Splits a session's unextracted turns into model-sized segments (context/extraction.md). */

import type { Db } from '../store/db.ts';

export type SegTurn = { seq: number; ts: string | null; role: string; text: string; files: string[] };

export const BUDGET_CHARS = 48_000;
const ASSISTANT_EDGE = 600;

/** Assistant text keeps its opening and closing; user text is kept whole. */
export function forPrompt(t: SegTurn): string {
  if (t.role !== 'assistant' || t.text.length <= ASSISTANT_EDGE * 2) return t.text;
  return `${t.text.slice(0, ASSISTANT_EDGE)} … ${t.text.slice(-ASSISTANT_EDGE)}`;
}

export function pendingTurns(db: Db, sessionId: string): SegTurn[] {
  const rows = db.prepare(
    `SELECT t.seq, t.ts, t.role, t.text, t.files_written FROM turns t JOIN sessions s ON s.id = t.session_id
     WHERE t.session_id = ? AND t.seq > s.turns_extracted ORDER BY t.seq`,
  ).all(sessionId) as { seq: number; ts: string | null; role: string; text: string; files_written: string }[];
  return rows.map((r) => ({ seq: r.seq, ts: r.ts, role: r.role, text: r.text, files: JSON.parse(r.files_written) as string[] }));
}

/** How much unread conversation a session holds, in prompt characters; 0 if none of it is the person's. */
export function pendingSize(db: Db, sessionId: string): number {
  const turns = pendingTurns(db, sessionId);
  if (!turns.some((t) => t.role === 'user' || t.role === 'doc')) return 0;
  return turns.reduce((a, t) => a + forPrompt(t).length + 40, 0);
}

export function segments(turns: readonly SegTurn[]): SegTurn[][] {
  const out: SegTurn[][] = [];
  let cur: SegTurn[] = [];
  let size = 0;
  for (const t of turns) {
    const n = forPrompt(t).length + 40;
    if (cur.length > 0 && size + n > BUDGET_CHARS) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(t);
    size += n;
  }
  if (cur.length > 0) out.push(cur);
  // A segment with no human words or saved document has no ideas in it.
  return out.filter((s) => s.some((t) => t.role === 'user' || t.role === 'doc'));
}
