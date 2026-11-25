/** The extraction prompt. Rules mirror context/spec.md "Identity model"; change both together. */

import { redactFully } from '../lib/text.ts';
import type { Db } from '../store/db.ts';
import { forPrompt, type SegTurn } from './segment.ts';

const RULES = `You maintain an idea ledger for one builder. You read a slice of their conversation with a coding
assistant and record what happened to their IDEAS: product, project or research ideas they are weighing
or pursuing. Not tasks, bugs, chores, tool questions or small talk. Most slices contain no idea events;
returning nothing is a good answer.

Identity rules:
- An idea's problem = who hurts + what pain. Names drift; the problem decides identity.
- Same problem → same idea. Event types: renamed {from,to}, narrowed {problem} (a subset of the same people
  with the same pain), widened {problem}, refined {note}, decided {decision}, tried {approach, outcome:
  "kept"|"dropped", why}.
- Problem changed → a NEW idea (add it to new_ideas) plus, on the old idea: pivoted {to} if the old one is
  replaced, or spawned {to} if both stay alive. "to" is required: the new idea's ref or id.
- Several ideas combined into one → merged {into} on each parent, where "into" is a new idea ref. Only when
  the builder clearly combines them.
- released {why}: the idea reached users: a release was published, a package published, a launch or
  production deploy happened. "[ran]" lines show commands that did this and are strong evidence; quote
  them. Intending or preparing to ship is not released. Released ideas can keep evolving afterwards.
- dropped {why, reason}: reason is "crowded" (others already do it well), "no-demand" (the pain was not strong
  enough), "not-feasible" (too hard or blocked) or "other". Never "not-interested": only the builder says that.
- Lifecycle: parked {why} (not now), resumed {why}, dropped {why} (let go
  deliberately), revived {why}, planned {plan} (an implementation plan was made), building {evidence}
  (implementation started), researched {report}, attached {file} (a doc about the idea was written; use the
  file path from "wrote:").
- Silence is not death: never infer dropped from an idea not being mentioned.
- An idea is a product, project or research direction someone could pursue on its own. A feature,
  component, surface, release step, marketing asset or task OF an existing idea is not a new idea: record it
  on that idea as refined or decided. Spawn only when the builder treats it as a separate thing to pursue,
  aimed at a different problem.
- A brand-new idea goes in new_ideas with a short title (2-6 words) and its problem. Do not create a new idea
  for something that is an existing idea under another name: use renamed.

Granularity: this is the idea's story, not a project log.
- Record only what changes what the idea IS, who it is FOR, or where it STANDS: positioning, audience,
  scope, product principles, approaches tried and kept or dropped, lifecycle moves.
- Implementation detail is not an idea event: code structure, detectors, tests, commits, bug fixes,
  tooling, refactors, individual plan files for coding tasks.
- building: once, when implementation of the idea first starts. planned: only a plan for the idea as a
  whole, not each coding task. attached: a spec, report or research doc about the idea, not code.
- At most 4 events per slice; keep the most consequential.

Documents:
- A DOCUMENT is a saved plan, spec or report (a digest: title, headings, each section's opening). Its subject is an idea:
  match it to an existing idea by problem, or add a new one. Record what it settles (decided, narrowed, planned, tried)
  and an attached {file} event with its path. Quote from the digest.

Evidence:
- seq: the [seq] of the turn that shows the event. quote: an exact substring of that turn, 3-25 words,
  preferably the builder's own words.
- confidence 0-1: how sure you are of the event type and the idea it belongs to.
- question: at most one, only when a merge is proposed or you cannot tell a pivot from a narrowing; else null.`;

const EXAMPLES = `Example A. Existing I-003 "Doc drift checker" (problem: teams' docs go stale). Builder: "let's only do
this for API reference docs at small startups". → events: narrowed on I-003 {problem: "small startups' API
reference docs go stale"}.

Example B. Existing I-007 "Idea ledger" (problem: builders lose track of their ideas). Builder: "forget
ideas, what I really want is to track my team's sprint velocity". → new_ideas: new:1 "Sprint velocity
tracker" (problem: teams can't see their velocity); events: pivoted on I-007 {to: "new:1"}.`;

type IdeaBrief = { id: string; title: string; problem: string; stage: string; recent: string };

function ideasSection(db: Db): string {
  const open = db.prepare(
    `SELECT i.id, i.title, i.problem, i.stage,
       (SELECT GROUP_CONCAT(type, ', ') FROM (SELECT type FROM events WHERE idea_id = i.id AND state != 'removed' ORDER BY ts DESC LIMIT 3)) AS recent
     FROM ideas i WHERE i.closed_at IS NULL ORDER BY i.updated_at DESC`,
  ).all() as IdeaBrief[];
  const closed = db.prepare('SELECT id, title, stage FROM ideas WHERE closed_at IS NOT NULL').all() as IdeaBrief[];
  const lines = open.map((i) => `- ${i.id} "${i.title}" [${i.stage}] problem: ${i.problem || '(unstated)'}; recent: ${i.recent ?? ''}`);
  const shut = closed.map((i) => `- ${i.id} "${i.title}" [${i.stage}]`);
  return [
    'Open ideas:', lines.length > 0 ? lines.join('\n') : '(none yet)',
    '', 'Closed ideas (revive only if clearly picked up again):', shut.length > 0 ? shut.join('\n') : '(none)',
  ].join('\n');
}

function turnsSection(turns: readonly SegTurn[]): string {
  return turns
    .map((t) => {
      const wrote = t.files.length > 0 ? `\n  wrote: ${t.files.join(', ')}` : '';
      const who = t.role === 'user' ? 'BUILDER' : t.role === 'command' ? 'COMMAND' : t.role === 'doc' ? `DOCUMENT (saved ${t.ts?.slice(0, 10) ?? 'earlier'}, path ${t.files[0] ?? ''})` : 'ASSISTANT';
      return `[${t.seq}] ${who}: ${forPrompt(t)}${wrote}`;
    })
    .join('\n\n');
}

const OVERLAP_TURNS = 3;

/** The turns just before a segment, so a thought cut at the boundary keeps its context (D19). */
function contextSection(db: Db, sessionId: string, first: number): string {
  const rows = (db.prepare('SELECT seq, ts, role, text FROM turns WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?')
    .all(sessionId, first, OVERLAP_TURNS) as { seq: number; ts: string | null; role: string; text: string }[]).reverse();
  if (rows.length === 0) return '';
  const turns = rows.map((r) => ({ ...r, files: [] }));
  return `Just before this slice (context only: already recorded, do not cite or repeat):\n${turnsSection(turns)}\n\n`;
}

/** Redacted again as a whole: joining turns can form a pattern no single turn had. */
export function buildPrompt(db: Db, project: string | null, turns: readonly SegTurn[], sessionId?: string): string {
  const first = turns[0]?.seq;
  return redactFully([
    RULES, '', EXAMPLES, '', ideasSection(db), '',
    `${sessionId !== undefined && first !== undefined ? contextSection(db, sessionId, first) : ''}Conversation slice (project: ${project ?? 'unknown'}):`,
    turnsSection(turns),
  ].join('\n'));
}
