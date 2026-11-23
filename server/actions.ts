/** Everything a person can do to the ledger. Each action returns the undo that reverses it. */

import { transact, type Db } from './store/db.ts';
import { addEvent, createIdea, getIdea, reproject, type EventRow, type EventType } from './store/ledger.ts';

export type Undo = { kind: 'set-state'; event: number; state: string } | { kind: 'remove-event'; event: number } | { kind: 'none' };
export type ActionResult = { ok: true; undo: Undo; id?: string | number } | { ok: false; error: string };

const now = (): string => new Date().toISOString();
const STAGE_MOVES = new Set<EventType>(['parked', 'resumed', 'released', 'dropped', 'revived', 'planned', 'building']);

function eventRow(db: Db, id: number): EventRow | undefined {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
}

function setState(db: Db, id: number, state: string): ActionResult {
  const e = eventRow(db, id);
  if (e === undefined) return { ok: false, error: 'no such event' };
  transact(db, () => {
    db.prepare('UPDATE events SET state = ? WHERE id = ?').run(state, id);
    // A question about an event the person has just settled is answered.
    db.prepare("UPDATE questions SET state = 'answered' WHERE state = 'open' AND json_extract(payload, '$.event') = ?").run(id);
    reproject(db, e.idea_id);
  });
  return { ok: true, undo: { kind: 'set-state', event: id, state: e.state } };
}

export const confirmEvent = (db: Db, id: number): ActionResult => setState(db, id, 'confirmed');
export const removeEvent = (db: Db, id: number): ActionResult => setState(db, id, 'removed');

/** Replace an event with the person's version; the original stays, superseded. */
export function correctEvent(db: Db, id: number, type: EventType, payload: Record<string, unknown>): ActionResult {
  const e = eventRow(db, id);
  if (e === undefined) return { ok: false, error: 'no such event' };
  const created = addEvent(db, {
    ideaId: e.idea_id, type, ts: e.ts, payload, origin: 'user', supersedes: id,
    ...(e.session_id !== null ? { sessionId: e.session_id } : {}),
    ...(e.turn_seq !== null ? { turnSeq: e.turn_seq } : {}),
    ...(e.quote !== null ? { quote: e.quote } : {}),
    ...(e.excerpt !== null ? { excerpt: e.excerpt } : {}),
  });
  return { ok: true, undo: { kind: 'remove-event', event: created }, id: created };
}

export function newIdea(db: Db, title: string, problem: string): ActionResult {
  if (title.trim() === '') return { ok: false, error: 'an idea needs a title' };
  const id = transact(db, () => createIdea(db, title.trim(), problem.trim(), { ts: now(), origin: 'user' }));
  const born = (db.prepare("SELECT id FROM events WHERE idea_id = ? AND type = 'born'").get(id) as { id: number }).id;
  return { ok: true, undo: { kind: 'set-state', event: born, state: 'removed' }, id };
}

export function renameIdea(db: Db, ideaId: string, title: string): ActionResult {
  const idea = getIdea(db, ideaId);
  if (idea === undefined || title.trim() === '') return { ok: false, error: 'no such idea, or empty title' };
  const id = addEvent(db, { ideaId, type: 'renamed', ts: now(), origin: 'user', payload: { from: idea.title, to: title.trim() } });
  return { ok: true, undo: { kind: 'remove-event', event: id } };
}

export function moveStage(db: Db, ideaId: string, type: EventType, why: string): ActionResult {
  if (!STAGE_MOVES.has(type) || getIdea(db, ideaId) === undefined) return { ok: false, error: 'not a stage move' };
  const id = addEvent(db, { ideaId, type, ts: now(), origin: 'user', payload: why.trim() === '' ? {} : { why: why.trim() } });
  return { ok: true, undo: { kind: 'remove-event', event: id } };
}

/** Merges are only ever applied here, on a person's yes (context/extraction.md). */
export function answerQuestion(db: Db, id: number, answer: string): ActionResult {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as { kind: string; payload: string } | undefined;
  if (q === undefined) return { ok: false, error: 'no such question' };
  const p = JSON.parse(q.payload) as { parents?: string[]; into?: { title?: string; problem?: string } | string; event?: number };
  transact(db, () => {
    if (q.kind === 'merge' && answer === 'yes') {
      const into = typeof p.into === 'object' ? p.into : {};
      const parents = (p.parents ?? []).filter((x) => getIdea(db, x) !== undefined);
      const title = into.title ?? parents.map((x) => getIdea(db, x)?.title).join(' + ');
      const child = createIdea(db, title, into.problem ?? '', { ts: now(), origin: 'user' });
      for (const parent of parents) {
        const ev = addEvent(db, { ideaId: parent, type: 'merged', ts: now(), origin: 'user', payload: { into: child } });
        db.prepare("INSERT INTO links (from_idea, to_idea, type, event_id) VALUES (?, ?, 'merge', ?)").run(parent, child, ev);
      }
    }
    if (q.kind === 'pivot-or-narrow' && p.event !== undefined) {
      if (answer === 'keep') setState(db, p.event, 'confirmed');
      if (answer === 'remove') setState(db, p.event, 'removed');
    }
    db.prepare("UPDATE questions SET state = ?, payload = json_set(payload, '$.answer', ?) WHERE id = ?")
      .run(answer === 'later' ? 'deferred' : 'answered', answer, id);
  });
  return { ok: true, undo: { kind: 'none' } };
}

export function undo(db: Db, u: Undo): ActionResult {
  if (u.kind === 'set-state') return setState(db, u.event, u.state);
  if (u.kind === 'remove-event') return setState(db, u.event, 'removed');
  return { ok: true, undo: { kind: 'none' } };
}
