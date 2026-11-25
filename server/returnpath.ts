/**
 * The return path: a plan made from a Scintle brief comes back as a `planned` event, tied to the idea version
 * it was planned against. A plan-mode plan is found by the brief's marker or the `/scintle:plan` command that
 * started it; without plan mode, the longest reply to that command before the next prompt is the plan.
 */

import { PLAN_PREFIX } from './ingest/parsers/claude-code.ts';
import type { Db } from './store/db.ts';
import { addEvent, getIdea } from './store/ledger.ts';

const MARKER = /scintle:idea=(I-\d+)@v(\d+)/;
const COMMAND = /^\/scintle:plan\s+(I-\d+)/i;
const MIN_PLAN_CHARS = 400;

type T = { seq: number; ts: string | null; role: string; text: string };
type Found = { ideaId: string; turn: T; plan: string; version: number | null };

function findPlans(turns: T[]): Found[] {
  const out: Found[] = [];
  let commanded: string | undefined;
  let candidate: T | undefined;
  const flush = (): void => {
    if (commanded && candidate) {
      const m = MARKER.exec(candidate.text);
      out.push({ ideaId: commanded, turn: candidate, plan: candidate.text, version: m?.[2] ? Number(m[2]) : null });
    }
    commanded = undefined;
    candidate = undefined;
  };

  for (const t of turns) {
    const cmd = t.role === 'command' ? COMMAND.exec(t.text) : null;
    if (cmd || t.role === 'user') flush();
    if (cmd) commanded = cmd[1]?.toUpperCase();

    if (t.role === 'assistant' && t.text.startsWith(PLAN_PREFIX)) {
      const plan = t.text.slice(PLAN_PREFIX.length);
      const m = MARKER.exec(plan);
      const ideaId = m?.[1] ?? commanded;
      if (ideaId !== undefined) out.push({ ideaId, turn: t, plan, version: m?.[2] ? Number(m[2]) : null });
      commanded = undefined;
      candidate = undefined;
    } else if (commanded && t.role === 'assistant' && t.text.length >= MIN_PLAN_CHARS && t.text.length > (candidate?.text.length ?? 0)) {
      candidate = t;
    }
  }
  flush();
  return out;
}

export function linkPlans(db: Db, sessionId: string): number {
  const turns = db.prepare('SELECT seq, ts, role, text FROM turns WHERE session_id = ? ORDER BY seq').all(sessionId) as T[];
  let added = 0;
  for (const f of findPlans(turns)) {
    if (getIdea(db, f.ideaId) === undefined) continue;
    // The companion may have recorded this plan as it was approved (D35), before the turn was known.
    const seen = db.prepare("SELECT 1 FROM events WHERE type = 'planned' AND session_id = ? AND (turn_seq = ? OR (idea_id = ? AND turn_seq IS NULL))")
      .get(sessionId, f.turn.seq, f.ideaId);
    if (seen !== undefined) continue;
    const title = /^#+\s*(.+)$/m.exec(f.plan)?.[1] ?? f.plan.slice(0, 120);
    addEvent(db, {
      ideaId: f.ideaId, type: 'planned', ts: f.turn.ts ?? new Date().toISOString(), origin: 'user', sessionId, turnSeq: f.turn.seq,
      payload: { plan: title, briefVersion: f.version },
      excerpt: f.plan.length > 1200 ? `${f.plan.slice(0, 1200)} …` : f.plan,
    });
    added++;
  }
  return added;
}
