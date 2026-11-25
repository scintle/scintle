/** Pure views over the snapshot: no fetching, no state. */

import type { Ev, Idea, Link, RawEvent, Resolution, Snapshot, Stage } from './types';

export const OPEN_STAGES: Stage[] = ['seed', 'exploring', 'planned', 'building'];
export const CLOSED_STAGES: Stage[] = ['released', 'dropped', 'evolved'];

export const STAGE_LABEL: Record<Stage, string> = {
  seed: 'Seed', exploring: 'Exploring', planned: 'Planned', building: 'Building',
  parked: 'Parked', released: 'Released', dropped: 'Dropped', evolved: 'Evolved',
};

export const EVENT_LABEL: Record<string, string> = {
  born: 'Born', renamed: 'Renamed', narrowed: 'Narrowed', widened: 'Widened', refined: 'Refined',
  decided: 'Decided', tried: 'Tried', pivoted: 'Pivoted', spawned: 'Spawned', merged: 'Merged',
  researched: 'Researched', planned: 'Planned', building: 'Building started', parked: 'Parked',
  resumed: 'Resumed', released: 'Released', dropped: 'Dropped', revived: 'Revived', attached: 'Doc attached',
};

export const EVENT_GROUP: Record<string, 'shape' | 'decide' | 'try' | 'life'> = {
  born: 'shape', renamed: 'shape', narrowed: 'shape', widened: 'shape', refined: 'shape', pivoted: 'shape',
  spawned: 'shape', merged: 'shape', decided: 'decide', tried: 'try', researched: 'decide', attached: 'decide',
  planned: 'life', building: 'life', parked: 'life', resumed: 'life', released: 'life', dropped: 'life', revived: 'life',
};

export function parseEvents(raw: RawEvent[]): Ev[] {
  return raw.map((e) => ({ ...e, payload: safeJson(e.payload), superseded: e.superseded === 1 }));
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const isLive = (e: Ev): boolean => e.state !== 'removed' && !e.superseded;

/** Unchecked and below 60% confidence: the only inferred events worth flagging (decisions D16). */

export function eventsByIdea(events: Ev[]): Map<string, Ev[]> {
  const m = new Map<string, Ev[]>();
  for (const e of events) m.set(e.idea_id, [...(m.get(e.idea_id) ?? []), e]);
  return m;
}

type NameOf = (id: string) => string;

/** One line a person can read: what the event says, without its type. Linked ideas are named, not numbered. */
export function eventDetail(e: Ev, nameOf: NameOf = (id) => id): string {
  const p = e.payload;
  const s = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '');
  switch (e.type) {
    case 'born': return s('problem');
    case 'renamed': return `${s('from')} → ${s('to')}`;
    case 'narrowed': case 'widened': return s('problem');
    case 'refined': return s('note');
    case 'decided': return s('decision');
    case 'tried': return `${s('approach')}${s('outcome') ? ` — ${s('outcome')}` : ''}${s('why') ? `: ${s('why')}` : ''}`;
    case 'researched': return s('summary') || s('report');
    case 'attached': return s('file');
    case 'planned': return s('plan');
    case 'building': return s('evidence');
    case 'pivoted': case 'spawned': return nameOf(s('to'));
    case 'merged': return nameOf(s('into'));
    case 'dropped': return [s('reason') ? RESOLUTION_LABEL[s('reason') as Resolution] ?? '' : '', s('why')].filter(Boolean).join(': ');
    default: return s('why');
  }
}

export function namesOf(events: Ev[], idea: Idea): string[] {
  const renames = events.filter((e) => isLive(e) && e.type === 'renamed').map((e) => String(e.payload['from'] ?? ''));
  return [...renames.filter((n) => n !== ''), idea.title];
}

/** "Where you left off": the latest live event, phrased. */
export function leftOff(events: Ev[], nameOf?: NameOf): string {
  const last = [...events].reverse().find((e) => isLive(e) && e.type !== 'born');
  if (last === undefined) return 'Just captured';
  const d = eventDetail(last, nameOf);
  return `${EVENT_LABEL[last.type] ?? last.type}${d ? `: ${d}` : ''}`;
}

export function relTime(ts: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(ts)) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function projectsOf(snap: Snapshot): string[] {
  const set = new Set<string>();
  for (const s of Object.values(snap.sources)) if (s.project) set.add(s.project);
  return [...set].sort();
}

/** Ideas whose evidence touches a project; ideas made on the board belong to every project. */
export function ideasInProject(snap: Snapshot, events: Ev[], project: string | null): Set<string> {
  const out = new Set<string>();
  for (const i of snap.ideas) {
    const sessions = events.filter((e) => e.idea_id === i.id && e.session_id !== null).map((e) => e.session_id as string);
    if (project === null || sessions.length === 0 || sessions.some((s) => snap.sources[s]?.project === project)) out.add(i.id);
  }
  return out;
}

export function lineage(links: Link[], id: string): { from: Link[]; to: Link[] } {
  return { from: links.filter((l) => l.to_idea === id), to: links.filter((l) => l.from_idea === id) };
}

/** Why an ended idea ended, as people read it. */
export const RESOLUTION_LABEL: Record<Resolution, string> = {
  released: 'Released', pivoted: 'Pivoted', merged: 'Merged', 'not-interested': 'Not interested',
  crowded: 'Crowded market', 'no-demand': 'No real demand', 'not-feasible': 'Not feasible', other: 'Other',
};
export const RESOLUTION_COLOR: Record<Resolution, string> = {
  released: 'var(--s-released)', pivoted: 'var(--accent)', merged: 'var(--ai)', 'not-interested': 'var(--muted)',
  crowded: 'var(--bad)', 'no-demand': 'var(--bad)', 'not-feasible': 'var(--bad)', other: 'var(--muted)',
};
export const DROP_REASONS: { reason: Resolution; hint: string }[] = [
  { reason: 'not-interested', hint: 'Looked at it; never wanted it' },
  { reason: 'crowded', hint: 'Others already do it well' },
  { reason: 'no-demand', hint: "The pain wasn't strong enough" },
  { reason: 'not-feasible', hint: 'Too hard, or blocked' },
  { reason: 'other', hint: 'Something else' },
];

type Move = { type: string; label: string; hint: string; drop?: true };

/** Lifecycle moves offered from the stage badge, with what each one means. `drop` opens the reason list. */
export function stageMoves(stage: Stage): Move[] {
  const drop: Move = { type: 'dropped', drop: true, label: 'Drop', hint: 'Let it go, with a reason' };
  if (stage === 'parked') return [{ type: 'resumed', label: 'Resume', hint: 'Back to active work' }, drop];
  if (CLOSED_STAGES.includes(stage)) return [{ type: 'revived', label: 'Revive', hint: 'Reopen this idea' }];
  return [
    { type: 'parked', label: 'Park', hint: 'Not now; keep it on the board' },
    { type: 'released', label: 'Mark released', hint: 'It reached users' },
    drop,
  ];
}

/** The one next step worth offering at this stage, if any. */
export function nextStep(stage: Stage): { action: 'research' | 'plan'; label: string; secondary?: { action: 'research' | 'plan'; label: string } } | null {
  if (stage === 'seed') return { action: 'research', label: 'Research this', secondary: { action: 'plan', label: 'Plan implementation' } };
  if (stage === 'exploring') return { action: 'plan', label: 'Plan implementation', secondary: { action: 'research', label: 'Research' } };
  return null;
}

/** How to introduce a quote without putting words in the person's mouth. */
export function saidBy(by: 'you' | 'claude' | 'document' | null): { lead: string; credit: string } {
  if (by === 'you') return { lead: 'when you said', credit: 'you' };
  if (by === 'claude') return { lead: 'when Claude wrote', credit: 'Claude' };
  if (by === 'document') return { lead: 'where the document says', credit: 'a saved document' };
  return { lead: 'from the record', credit: 'the record' };
}
