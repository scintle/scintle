/** Handing an idea's history to Claude Code without copy and paste: context for a prompt, or a new planning session. */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { buildBrief } from './brief.ts';
import { redact } from './lib/redact.ts';
import { addEvent } from './store/ledger.ts';
import type { Db } from './store/db.ts';

const MAX_IDEAS = 2;
const ID = /^I-\d+$/;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Paths and URLs, where a name is usually a folder, not the topic (~/code/trailwatch/DECISIONS.md). */
const PATHISH = /(?:https?:\/\/\S+|(?:~|\.{1,2})?\/?[\w.@-]+(?:\/[\w.@-]+)+\/?)/g;

/** Code spans and double-quoted passages. */
const QUOTED = /```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|“[^”\n]*”/g;

/** Ideas a text names: by ID, or by a current or former title of at least two words or eight letters, outside paths and URLs. */
export function matchIdeas(db: Db, raw: string): string[] {
  const text = raw.replace(PATHISH, ' ');
  // An ID inside code or quotes is an example being discussed (`/scintle:plan I-007`), not the topic; a quoted title still is.
  const found = new Set<string>(text.replace(QUOTED, ' ').match(/\bI-\d{3,}\b/g) ?? []);
  const names = db.prepare(
    `SELECT id, title AS name FROM ideas
     UNION SELECT idea_id, json_extract(payload, '$.from') FROM events WHERE type = 'renamed' AND state != 'removed'`,
  ).all() as { id: string; name: string | null }[];
  for (const { id, name } of names) {
    if (!name || (name.trim().split(/\s+/).length < 2 && name.length < 8)) continue;
    if (new RegExp(`(^|\\W)${escape(name.trim())}($|\\W)`, 'i').test(text)) found.add(id);
  }
  const exists = db.prepare('SELECT 1 FROM ideas WHERE id = ?');
  return [...found].filter((id) => exists.get(id) !== undefined).slice(0, MAX_IDEAS);
}

/** A brief as context, not as a request: without the plan marker or the closing "Ask". */
function asContext(body: string): string {
  return body.replace(/^<!-- scintle:idea=.*-->\n?/m, '').replace(/\n## Ask[\s\S]*$/, '').trim();
}

/** One idea's history for the model, or undefined when there is no such idea. */
export function historyOf(db: Db, ideaId: string): string | undefined {
  const b = buildBrief(db, ideaId, { ids: true });
  if (b === undefined) return undefined;
  const body = asContext(b.body);
  return /\[#\d+\]/.test(body)
    ? `${body}\n\nIf the user proposes, or you are about to plan, something that repeats an approach or idea above marked dropped [#id], call flag_dead_end with that id before answering, then say so. Only for a real repeat, not a related topic.`
    : body;
}

export type DeadEnd = { eventId: number; ideaId: string; title: string; what: string; why: string; day: string };

/** A dropped approach or a dropped idea, from the board's own record; undefined for anything else (D33). */
export function deadEnd(db: Db, eventId: number): DeadEnd | undefined {
  const e = db.prepare(
    `SELECT e.id, e.idea_id, e.type, e.ts, e.payload, i.title FROM events e JOIN ideas i ON i.id = e.idea_id
     WHERE e.id = ? AND e.state != 'removed' AND NOT EXISTS (SELECT 1 FROM events c WHERE c.supersedes = e.id AND c.state != 'removed')`,
  ).get(eventId) as { id: number; idea_id: string; type: string; ts: string; payload: string; title: string } | undefined;
  if (e === undefined) return undefined;
  const p = JSON.parse(e.payload) as Record<string, unknown>;
  const s = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const base = { eventId: e.id, ideaId: e.idea_id, title: e.title, day: e.ts.slice(0, 10) };
  if (e.type === 'tried' && p['outcome'] === 'dropped') return { ...base, what: s('approach'), why: s('why') };
  if (e.type === 'dropped') return { ...base, what: e.title, why: s('why') || DROP_REASON[s('reason')] || '' };
  return undefined;
}

const DROP_REASON: Record<string, string> = {
  'not-interested': 'not interested', crowded: 'crowded market', 'no-demand': 'no real demand', 'not-feasible': 'not feasible',
};

type Hit = { id: string; title: string; stage: string; ended: string | null; problem: string; last: string };

/** Ideas by topic: each word (3+ letters) found in a title, former name, problem or quote counts; best first. Empty: every idea. */
export function searchIdeas(db: Db, query: string, limit = 12): { total: number; ideas: Hit[] } {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  const rows = db.prepare(
    `SELECT i.id, i.title, i.stage, i.resolution AS ended, i.problem, i.updated_at,
       lower(i.title || ' ' || i.problem || ' ' || COALESCE((SELECT group_concat(COALESCE(e.quote, '') || ' ' || e.payload, ' ') FROM events e WHERE e.idea_id = i.id AND e.state != 'removed'), '')) AS hay
     FROM ideas i`,
  ).all() as (Omit<Hit, 'last'> & { updated_at: string; hay: string })[];
  const scored = rows
    .map((r) => ({ r, score: words.length === 0 ? 1 : words.reduce((n, w) => n + (r.hay.includes(w) ? (r.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.updated_at.localeCompare(a.r.updated_at));
  return {
    total: scored.length,
    ideas: scored.slice(0, limit).map(({ r }) => ({ id: r.id, title: r.title, stage: r.stage, ended: r.ended, problem: r.problem.slice(0, 200), last: r.updated_at.slice(0, 10) })),
  };
}

/**
 * What a prompt naming ideas gets attached: a pointer, not the brief, so a name mentioned in passing costs a
 * line and the model decides whether to read the history (idea_history).
 */
export function contextFor(db: Db, text: string, skip: readonly string[] = []): { ideas: { id: string; title: string }[]; context: string } {
  const title = db.prepare('SELECT title, stage FROM ideas WHERE id = ?');
  const ideas = matchIdeas(db, text).filter((id) => !skip.includes(id)).map((id) => ({ id, ...(title.get(id) as { title: string; stage: string }) }));
  if (ideas.length === 0) return { ideas: [], context: '' };
  const list = ideas.map((i) => `${i.title} (${i.id}, ${i.stage})`).join(' and ');
  return {
    ideas: ideas.map(({ id, title: t }) => ({ id, title: t })),
    context: `Scintle, the user's idea board, has history for ${list}. If this prompt is about ${ideas.length > 1 ? 'one of them' : 'it'}, call idea_history with the ID before answering: it holds the decisions made and what was already tried and dropped. If the name is only mentioned in passing, ignore this.`,
  };
}

type CardEvent = { id: number; ts: string; type: string; payload: Record<string, unknown>; quote: string | null; by: string | null; origin: string; state: string };
type CardLink = { id: string; title: string; stage: string; type: string };
export type IdeaCard = {
  id: string; title: string; stage: string; ended: string | null; problem: string; formerly: string[];
  from: CardLink[]; to: CardLink[]; events: CardEvent[]; total: number;
};

const MAX_CARD_EVENTS = 80;

/** One idea as the companion reads it: who it is, how it ended, its links, and its live events oldest first. */
export function ideaCard(db: Db, ideaId: string): IdeaCard | undefined {
  const idea = db.prepare('SELECT id, title, stage, resolution, problem FROM ideas WHERE id = ?').get(ideaId) as
    { id: string; title: string; stage: string; resolution: string | null; problem: string } | undefined;
  if (idea === undefined) return undefined;
  const live = `state != 'removed' AND NOT EXISTS (SELECT 1 FROM events c WHERE c.supersedes = e.id AND c.state != 'removed')`;
  const rows = db.prepare(`SELECT id, ts, type, quote, quote_by, payload, origin, state FROM events e WHERE idea_id = ? AND ${live} ORDER BY ts, id`).all(ideaId) as
    { id: number; ts: string; type: string; quote: string | null; quote_by: string | null; payload: string; origin: string; state: string }[];
  const titleOf = db.prepare('SELECT title FROM ideas WHERE id = ?');
  const parse = (p: string): Record<string, unknown> => {
    try {
      const o = JSON.parse(p) as Record<string, unknown>;
      // Linked ideas by name, so the pane never shows a bare ID.
      for (const k of ['to', 'into']) {
        const v = o[k];
        if (typeof v === 'string' && /^I-\d+$/.test(v)) o[`${k}Title`] = (titleOf.get(v) as { title: string } | undefined)?.title ?? v;
      }
      return o;
    } catch {
      return {};
    }
  };
  const links = (sql: string): CardLink[] => db.prepare(sql).all(ideaId) as CardLink[];
  const events = rows.map((r) => ({ id: r.id, ts: r.ts, type: r.type, payload: parse(r.payload), quote: r.quote, by: r.quote_by, origin: r.origin, state: r.state }));
  return {
    id: idea.id, title: idea.title, stage: idea.stage, ended: idea.resolution, problem: idea.problem,
    formerly: events.filter((e) => e.type === 'renamed').map((e) => String(e.payload['from'] ?? '')).filter(Boolean),
    from: links(`SELECT i.id, i.title, i.stage, l.type FROM links l JOIN ideas i ON i.id = l.from_idea WHERE l.to_idea = ?`),
    to: links(`SELECT i.id, i.title, i.stage, l.type FROM links l JOIN ideas i ON i.id = l.to_idea WHERE l.from_idea = ?`),
    events: events.slice(-MAX_CARD_EVENTS),
    total: events.length,
  };
}

export type PickIdea = { id: string; title: string; stage: string; ended: string | null; problem: string; moved: string; last: string };
const OPEN_ORDER: Record<string, number> = { building: 0, planned: 1, exploring: 2, seed: 3, parked: 4, released: 5, evolved: 6, dropped: 7 };

/** Every idea for the companion's plan picker: open ones first, each stage most recently moved first, with its latest step. */
export function pickerIdeas(db: Db): PickIdea[] {
  const rows = db.prepare(
    `SELECT i.id, i.title, i.stage, i.resolution AS ended, i.problem, i.updated_at AS moved,
       (SELECT e.type FROM events e WHERE e.idea_id = i.id AND e.state != 'removed' ORDER BY e.ts DESC LIMIT 1) AS last
     FROM ideas i`,
  ).all() as (Omit<PickIdea, 'last'> & { last: string | null })[];
  return rows
    .map((r) => ({ ...r, problem: r.problem.slice(0, 160), last: r.last ?? 'born' }))
    .sort((a, b) => (OPEN_ORDER[a.stage] ?? 9) - (OPEN_ORDER[b.stage] ?? 9) || b.moved.localeCompare(a.moved));
}

export type Here = {
  idea: { id: string; title: string; stage: string; step: string; detail: string; at: string } | null;
  /** Other ideas worked on in this umbrella folder; 0 when the folder is one idea's. */
  others: number;
};

/** One readable line for an event: its type's word, and what it says. */
function stepOf(type: string, payload: string): { step: string; detail: string } {
  const p = JSON.parse(payload) as Record<string, unknown>;
  const s = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const detail = s('decision') || s('approach') || s('plan') || s('summary') || s('problem') || s('note') || s('evidence') || s('why');
  return { step: type, detail: detail.slice(0, 120) };
}

/**
 * Where you left off in a folder (D34). A folder one idea dominates (60%+ of the events from sessions and documents
 * there or below) is that idea's; otherwise it is an umbrella, and the answer is the idea last worked on in a real
 * session there. Dropped and evolved ideas never show; nothing for the home folder.
 */
export function hereFor(db: Db, cwd: string): Here {
  const dir = cwd.replace(/\/+$/, '');
  if (dir === '' || dir === homedir()) return { idea: null, others: 0 };
  // Redaction stores the home folder as "~" (server/lib/redact.ts), so a folder is looked up both ways.
  const tilde = dir.startsWith(`${homedir()}/`) ? `~${dir.slice(homedir().length)}` : dir;
  const like = (d: string): string => `${d.replace(/[\\%_]/g, '\\$&')}/%`;
  const rows = db.prepare(
    `SELECT e.idea_id AS id, COUNT(*) AS n, MAX(CASE WHEN s.harness != 'doc' THEN e.ts END) AS worked
     FROM events e JOIN sessions s ON s.id = e.session_id JOIN ideas i ON i.id = e.idea_id
     WHERE e.state != 'removed' AND i.stage NOT IN ('dropped', 'evolved')
       AND (s.cwd IN (?, ?) OR s.cwd LIKE ? ESCAPE '\\' OR s.cwd LIKE ? ESCAPE '\\')
     GROUP BY e.idea_id`,
  ).all(dir, tilde, like(dir), like(tilde)) as { id: string; n: number; worked: string | null }[];
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  const owner = rows.find((r) => r.n >= total * 0.6);
  const recent = rows.filter((r) => r.worked !== null).sort((a, b) => (b.worked as string).localeCompare(a.worked as string))[0];
  const pick = owner ?? recent;
  if (pick === undefined) return { idea: null, others: 0 };
  const idea = db.prepare('SELECT id, title, stage FROM ideas WHERE id = ?').get(pick.id) as { id: string; title: string; stage: string };
  const last = db.prepare(
    `SELECT type, payload, quote, ts FROM events WHERE idea_id = ? AND state != 'removed' AND type != 'born' ORDER BY ts DESC LIMIT 1`,
  ).get(pick.id) as { type: string; payload: string; quote: string | null; ts: string } | undefined;
  const found = last ? stepOf(last.type, last.payload) : { step: 'born', detail: '' };
  // An event with no detail of its own still has the words it came from.
  const step = { ...found, detail: found.detail || (last?.quote ?? '').slice(0, 120) };
  return { idea: { ...idea, ...step, at: last?.ts ?? '' }, others: owner ? 0 : rows.length - 1 };
}

/**
 * A plan approved in Claude Code, recorded on its idea as it happens (D35): the idea named by the brief's marker, or
 * else the one idea the plan names. Once per idea and session; redacted before it is stored.
 */
export function recordPlan(db: Db, sessionId: string, plan: string): { id: string; title: string } | undefined {
  const marked = /scintle:idea=(I-\d+)@v(\d+)/.exec(plan);
  const named = matchIdeas(db, plan);
  const ideaId = marked?.[1] ?? (named.length === 1 ? named[0] : undefined);
  const idea = ideaId === undefined ? undefined : db.prepare('SELECT id, title FROM ideas WHERE id = ?').get(ideaId) as { id: string; title: string } | undefined;
  if (idea === undefined || sessionId === '') return undefined;
  if (db.prepare("SELECT 1 FROM events WHERE type = 'planned' AND idea_id = ? AND session_id = ?").get(idea.id, sessionId) !== undefined) return idea;
  const text = redact(plan).text;
  const title = /^#+\s*(.+)$/m.exec(text)?.[1] ?? text.slice(0, 120);
  addEvent(db, {
    ideaId: idea.id, type: 'planned', ts: new Date().toISOString(), origin: 'user', sessionId,
    payload: { plan: title, ...(marked ? { briefVersion: Number(marked[2]) } : {}) },
    excerpt: text.length > 1200 ? `${text.slice(0, 1200)} …` : text,
  });
  return idea;
}

export type Caught = { id: string; title: string; type: string; detail: string };

/** What reading recorded since `since` (inferred events, by when they were recorded), optionally for one session. */
export function caughtSince(db: Db, since: string, sessionId = ''): Caught[] {
  const rows = db.prepare(
    `SELECT e.idea_id AS id, i.title, e.type, e.payload FROM events e JOIN ideas i ON i.id = e.idea_id
     WHERE e.origin = 'inferred' AND e.state != 'removed' AND e.created_at > ? AND (? = '' OR e.session_id = ?)
     ORDER BY e.created_at`,
  ).all(since, sessionId, sessionId) as { id: string; title: string; type: string; payload: string }[];
  return rows.map((r) => ({ id: r.id, title: r.title, type: r.type, detail: stepOf(r.type, r.payload).detail }));
}

/** The folder the idea was last worked in, from its sessions; home when none still exists. */
function projectDir(db: Db, ideaId: string): string {
  const rows = db.prepare(
    `SELECT s.cwd FROM events e JOIN sessions s ON s.id = e.session_id
     WHERE e.idea_id = ? AND s.cwd IS NOT NULL AND s.harness != 'doc' ORDER BY e.ts DESC LIMIT 20`,
  ).all(ideaId) as { cwd: string }[];
  return rows.map((r) => r.cwd).find((d) => existsSync(d)) ?? homedir();
}

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Opens a new terminal window running `claude "/scintle:plan <id>"` in the idea's project. */
export function planInNewSession(db: Db, ideaId: string): Promise<{ ok: true; cwd: string } | { ok: false; error: string; command: string }> {
  const command = `/scintle:plan ${ideaId}`;
  if (!ID.test(ideaId)) return Promise.resolve({ ok: false, error: 'not an idea id', command });
  const cwd = projectDir(db, ideaId);
  const line = `cd ${shellQuote(cwd)} && claude ${shellQuote(command)}`;
  let argv: string[];
  if (process.platform === 'darwin') {
    const script = `tell application "Terminal"\n  activate\n  do script ${JSON.stringify(line)}\nend tell`;
    argv = ['osascript', '-e', script];
  } else if (process.platform === 'linux') {
    argv = ['x-terminal-emulator', '-e', 'sh', '-c', `${line}; exec $SHELL`];
  } else {
    return Promise.resolve({ ok: false, error: 'opening a terminal is not supported here', command });
  }
  return new Promise((done) => {
    execFile(argv[0] as string, argv.slice(1), { timeout: 10_000 }, (err) =>
      done(err ? { ok: false, error: `could not open a terminal (${err.message.split('\n')[0]})`, command } : { ok: true, cwd }));
  });
}
