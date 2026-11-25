/** Ideas, events and links. Events are append-only; `ideas` is a projection of them (context/data-model.md). */

import { transact, type Db } from './db.ts';

export const EVENT_TYPES = [
  'born', 'renamed', 'narrowed', 'widened', 'refined', 'decided', 'tried',
  'pivoted', 'spawned', 'merged', 'researched', 'planned', 'building',
  'parked', 'resumed', 'released', 'dropped', 'revived', 'attached',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** `evolved`: closed because it continued as another idea (pivot or merge). */
type Stage = 'seed' | 'exploring' | 'planned' | 'building' | 'parked' | 'released' | 'dropped' | 'evolved';

export type NewEvent = {
  ideaId: string;
  type: EventType;
  ts: string;
  payload?: Record<string, unknown>;
  origin: 'inferred' | 'user';
  confidence?: number;
  sessionId?: string;
  turnSeq?: number;
  quote?: string;
  quoteBy?: QuoteBy;
  excerpt?: string;
  supersedes?: number;
};

/** Why an ended idea ended (D24). Only the person sets `not-interested`; the model may suggest the middle three. */
const RESOLUTIONS = ['released', 'pivoted', 'merged', 'not-interested', 'crowded', 'no-demand', 'not-feasible', 'other'] as const;
type Resolution = (typeof RESOLUTIONS)[number];
export const DROP_REASONS = new Set<string>(['not-interested', 'crowded', 'no-demand', 'not-feasible', 'other']);

export type IdeaRow = { id: string; title: string; problem: string; stage: Stage; created_at: string; updated_at: string; closed_at: string | null; resolution: Resolution | null };
export type EventRow = {
  id: number; idea_id: string; type: EventType; ts: string; payload: string; confidence: number | null;
  origin: string; state: string; session_id: string | null; turn_seq: number | null; quote: string | null; quote_by: QuoteBy | null;
  excerpt: string | null; supersedes: number | null; created_at: string;
};

const now = (): string => new Date().toISOString();

/** A new number every time, never reused, even after an idea is deleted (D19). */
function mintIdeaId(db: Db): string {
  const { value } = db.prepare("SELECT value FROM meta WHERE key = 'next_idea'").get() as { value: number };
  db.prepare("UPDATE meta SET value = value + 1 WHERE key = 'next_idea'").run();
  return `I-${String(value).padStart(3, '0')}`;
}

/** Births this close in the same session are the same idea re-read; it keeps its ID. */
const ANCHOR_WINDOW = 6;

/** The ID an earlier run gave an idea born at this spot, if that ID is free again. */
function anchoredId(db: Db, sessionId: string, seq: number): string | undefined {
  const row = db.prepare(
    `SELECT idea_id FROM anchors
     WHERE session_id = ? AND ABS(turn_seq - ?) <= ?
       AND idea_id NOT IN (SELECT idea_id FROM events WHERE type = 'born' AND state != 'removed')
     ORDER BY ABS(turn_seq - ?) LIMIT 1`,
  ).get(sessionId, seq, ANCHOR_WINDOW, seq) as { idea_id: string } | undefined;
  return row?.idea_id;
}

export function createIdea(db: Db, title: string, problem: string, born: Omit<NewEvent, 'ideaId' | 'type'>): string {
  const anchored = born.sessionId !== undefined && born.turnSeq !== undefined ? anchoredId(db, born.sessionId, born.turnSeq) : undefined;
  const id = anchored ?? mintIdeaId(db);
  if (getIdea(db, id) === undefined) {
    db.prepare('INSERT INTO ideas (id, title, problem, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, title, problem, born.ts, born.ts);
  }
  db.prepare('INSERT OR REPLACE INTO anchors (idea_id, session_id, turn_seq) VALUES (?, ?, ?)').run(id, born.sessionId ?? null, born.turnSeq ?? null);
  addEvent(db, { ...born, ideaId: id, type: 'born', payload: { title, problem, ...born.payload } });
  return id;
}

/**
 * Forget what extraction inferred so it can be re-read; keep everything the person did (D19).
 * Ideas left with no events are removed; their anchors stay so a re-read gives them back their IDs.
 */
export function resetInferred(db: Db): void {
  transact(db, () => {
    db.exec(`
      DELETE FROM questions;
      UPDATE events SET supersedes = NULL
        WHERE supersedes IN (SELECT id FROM events WHERE origin = 'inferred');
      DELETE FROM links WHERE event_id IN (SELECT id FROM events WHERE origin = 'inferred');
      DELETE FROM events WHERE origin = 'inferred';
      DELETE FROM briefs WHERE idea_id NOT IN (SELECT idea_id FROM events);
      DELETE FROM jobs WHERE idea_id IS NOT NULL AND idea_id NOT IN (SELECT idea_id FROM events);
      DELETE FROM ideas WHERE id NOT IN (SELECT idea_id FROM events);
      UPDATE sessions SET turns_extracted = -1, size = 0;
    `);
    for (const { id } of db.prepare('SELECT id FROM ideas').all() as { id: string }[]) reproject(db, id);
  });
}

/** Who a quote is from, kept with the event so it outlives the transcript: the person, Claude, or a saved document. */
export type QuoteBy = 'you' | 'claude' | 'document';

export function addEvent(db: Db, e: NewEvent): number {
  const state = e.origin === 'user' ? 'confirmed' : 'dotted';
  const by = e.quoteBy ?? (e.quote && e.sessionId && e.turnSeq !== undefined
    ? (db.prepare(`SELECT CASE t.role WHEN 'user' THEN 'you' WHEN 'command' THEN 'you' WHEN 'assistant' THEN 'claude' WHEN 'doc' THEN 'document' END AS by FROM turns t WHERE t.session_id = ? AND t.seq = ?`).get(e.sessionId, e.turnSeq) as { by: QuoteBy | null } | undefined)?.by ?? null
    : null);
  const r = db.prepare(
    `INSERT INTO events (idea_id, type, ts, payload, confidence, origin, state, session_id, turn_seq, quote, quote_by, excerpt, supersedes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    e.ideaId, e.type, e.ts, JSON.stringify(e.payload ?? {}), e.confidence ?? null, e.origin, state,
    e.sessionId ?? null, e.turnSeq ?? null, e.quote ?? null, by, e.excerpt ?? null, e.supersedes ?? null, now(),
  );
  reproject(db, e.ideaId);
  return Number(r.lastInsertRowid);
}

export function addLink(db: Db, from: string, to: string, type: 'pivot' | 'spawn' | 'merge', eventId: number): void {
  db.prepare('INSERT INTO links (from_idea, to_idea, type, event_id) VALUES (?, ?, ?, ?)').run(from, to, type, eventId);
}

/** Live events of an idea, oldest first: not removed, and not replaced by a later live event. */
export function liveEvents(db: Db, ideaId: string): EventRow[] {
  return db.prepare(
    `SELECT * FROM events e WHERE idea_id = ? AND state != 'removed'
       AND NOT EXISTS (SELECT 1 FROM events c WHERE c.supersedes = e.id AND c.state != 'removed')
     ORDER BY ts, id`,
  ).all(ideaId) as EventRow[];
}

const OPEN_STAGES = new Set<Stage>(['seed', 'exploring', 'planned', 'building']);

/** Recompute title, problem and stage from the live events. */
export function reproject(db: Db, ideaId: string): void {
  let title: string | undefined;
  let problem = '';
  let stage: Stage = 'seed';
  let lastOpen: Stage = 'seed';
  let closedAt: string | null = null;
  let resolution: Resolution | null = null;
  let updated = '';

  for (const e of liveEvents(db, ideaId)) {
    const p = JSON.parse(e.payload) as Record<string, unknown>;
    const str = (k: string): string | undefined => (typeof p[k] === 'string' && p[k] !== '' ? (p[k] as string) : undefined);
    updated = e.ts;
    if (e.type !== 'born' && stage === 'seed') stage = 'exploring';
    switch (e.type) {
      case 'born':
        title = str('title') ?? title;
        problem = str('problem') ?? problem;
        break;
      case 'renamed':
        title = str('to') ?? title;
        break;
      case 'narrowed':
      case 'widened':
        problem = str('problem') ?? problem;
        break;
      case 'planned':
      case 'building':
        stage = e.type;
        break;
      case 'parked':
        stage = 'parked';
        break;
      case 'resumed':
      case 'revived':
        stage = lastOpen;
        closedAt = null;
        resolution = null;
        break;
      case 'released':
      case 'dropped':
      case 'pivoted':
      case 'merged':
        stage = e.type === 'pivoted' || e.type === 'merged' ? 'evolved' : e.type;
        closedAt = e.ts;
        resolution = e.type === 'dropped'
          ? (DROP_REASONS.has(str('reason') ?? '') ? (str('reason') as Resolution) : 'other')
          : e.type;
        break;
    }
    if (OPEN_STAGES.has(stage)) lastOpen = stage;
  }
  if (title === undefined) return;
  db.prepare('UPDATE ideas SET title = ?, problem = ?, stage = ?, closed_at = ?, resolution = ?, updated_at = ? WHERE id = ?')
    .run(title, problem, stage, closedAt, resolution, updated, ideaId);
}

export function getIdea(db: Db, id: string): IdeaRow | undefined {
  return db.prepare('SELECT * FROM ideas WHERE id = ?').get(id) as IdeaRow | undefined;
}

export function allIdeas(db: Db): IdeaRow[] {
  return db.prepare('SELECT * FROM ideas ORDER BY updated_at DESC').all() as IdeaRow[];
}

/** Links whose making event is still live. */
export function linksOf(db: Db, ideaId: string): { from_idea: string; to_idea: string; type: string }[] {
  return db.prepare(
    `SELECT l.from_idea, l.to_idea, l.type FROM links l LEFT JOIN events e ON e.id = l.event_id
     WHERE (l.from_idea = ? OR l.to_idea = ?)
       AND (l.event_id IS NULL OR (e.state != 'removed'
         AND NOT EXISTS (SELECT 1 FROM events c WHERE c.supersedes = e.id AND c.state != 'removed')))`,
  ).all(ideaId, ideaId) as { from_idea: string; to_idea: string; type: string }[];
}

/** Recompute every idea's projection, e.g. after a migration adds a derived column. */
export function reprojectAll(db: Db): void {
  transact(db, () => {
    for (const { id } of db.prepare('SELECT id FROM ideas').all() as { id: string }[]) reproject(db, id);
  });
}
