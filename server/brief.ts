/** The hand-off brief: built from the ledger alone, so it is instant, free and quotes only real evidence. */

import type { Db } from './store/db.ts';
import { getIdea, linksOf, liveEvents, type EventRow } from './store/ledger.ts';

const payloadOf = (e: EventRow): Record<string, unknown> => JSON.parse(e.payload) as Record<string, unknown>;
const day = (ts: string): string => ts.slice(0, 10);

const REASON: Record<string, string> = {
  'not-interested': 'not interested', crowded: 'crowded market', 'no-demand': 'no real demand', 'not-feasible': 'not feasible', other: 'other',
};
const LIFECYCLE = ['planned', 'building', 'parked', 'resumed', 'released', 'dropped', 'revived'];

function line(e: EventRow): string {
  const p = payloadOf(e);
  const detail = String(p['decision'] ?? p['problem'] ?? p['note'] ?? p['why'] ?? p['to'] ?? p['plan'] ?? p['file'] ?? '');
  const reason = typeof p['reason'] === 'string' ? ` (${REASON[p['reason']] ?? p['reason']})` : '';
  const quote = e.quote === null ? '' : ` — "${e.quote}"`;
  return `- ${day(e.ts)} ${e.type}${reason}${detail === '' ? '' : `: ${detail}`}${quote}`;
}

export function buildBrief(db: Db, ideaId: string): { body: string; version: number } | undefined {
  const idea = getIdea(db, ideaId);
  if (idea === undefined) return undefined;
  const events = liveEvents(db, ideaId);
  const version = events.length;
  const names = events.filter((e) => e.type === 'renamed').map((e) => String(payloadOf(e)['from'] ?? ''));
  const tried = events.filter((e) => e.type === 'tried');
  const decided = events.filter((e) => e.type === 'decided');
  const shaping = events.filter((e) => ['born', 'narrowed', 'widened', 'refined', 'renamed', 'pivoted', 'spawned'].includes(e.type));
  // Parked, dropped, released and the rest, with the reason and the person's own why: what a planner must not undo blindly.
  const lifecycle = events.filter((e) => LIFECYCLE.includes(e.type));
  const docs = events.filter((e) => e.type === 'attached' || e.type === 'researched').map((e) => String(payloadOf(e)['file'] ?? payloadOf(e)['report'] ?? ''));
  const origins = linksOf(db, ideaId).filter((l) => l.to_idea === ideaId).map((l) => `${l.from_idea} (${l.type})`);
  const open = db.prepare("SELECT kind, payload FROM questions WHERE idea_id = ? AND state = 'open'").all(ideaId) as { kind: string; payload: string }[];

  const section = (title: string, rows: string[]): string[] => (rows.length === 0 ? [] : [`## ${title}`, ...rows, '']);
  const body = [
    `# Brief: ${idea.title} (${idea.id})`,
    `<!-- scintle:idea=${idea.id}@v${version} -->`,
    '',
    `**Problem now:** ${idea.problem || '(not yet stated)'}`,
    `**Stage:** ${idea.stage}${names.length > 0 ? ` · **Earlier names:** ${names.join(' → ')}` : ''}`,
    ...(origins.length > 0 ? [`**Grew out of:** ${origins.join(', ')}`] : []),
    '',
    ...section('How it got here', shaping.map(line)),
    ...section('Decisions already made', decided.map(line)),
    ...section('Tried before (do not repeat what was dropped)', tried.map((e) => {
      const p = payloadOf(e);
      return `- ${String(p['approach'] ?? '')}: **${String(p['outcome'] ?? '?')}**${p['why'] ? ` (${String(p['why'])})` : ''}${e.quote ? ` — "${e.quote}"` : ''}`;
    })),
    ...section('Lifecycle', lifecycle.map(line)),
    ...section('Documents', docs.filter((d) => d !== '').map((d) => `- ${d}`)),
    ...section('Open questions', open.map((q) => `- ${q.kind}: ${q.payload}`)),
    '## Ask',
    'Plan an implementation of this idea as it stands now. Respect the decisions above, avoid the dropped',
    `approaches, and say which open questions block the plan. Keep the marker scintle:idea=${idea.id}@v${version} in the plan.`,
  ].join('\n');
  return { body, version };
}

export function saveBrief(db: Db, ideaId: string): { id: number; body: string; version: number } | undefined {
  const b = buildBrief(db, ideaId);
  if (b === undefined) return undefined;
  const r = db.prepare('INSERT INTO briefs (idea_id, idea_version, body, created_at) VALUES (?, ?, ?, ?)')
    .run(ideaId, b.version, b.body, new Date().toISOString());
  return { id: Number(r.lastInsertRowid), ...b };
}
