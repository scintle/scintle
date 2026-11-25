/** Handing an idea's history to Claude Code without copy and paste: context for a prompt, or a new planning session. */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { buildBrief } from './brief.ts';
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
  const b = buildBrief(db, ideaId);
  return b === undefined ? undefined : asContext(b.body);
}

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
