/** Snapshot → the lens model: day columns sized by activity, lanes, families, glyph-typed events. */

import { EVENT_LABEL, eventDetail, isLive } from '../lib/derive';
import type { Ev, Idea, Link, Resolution } from '../lib/types';

/** A time as [column key, hour within the column's 0–24 span]. */
export type LT = [string, number];
/** `label` is the full date for tooltips and wide columns; `short` is the day, with the month where it changes. */
export type Col = { k: string; label: string; short: string; w: number; start: number; end: number };
export type Range = { from: number | null; to: number | null };
/** Statuses grouped the way the toolbar filters them. */
export type StatusGroup = 'active' | 'quiet' | 'ended';
export type Glyph = 'born' | 'rename' | 'narrowed' | 'decided' | 'report' | 'parked' | 'dropped';
export type Status = 'active' | 'dormant' | 'parked' | 'merged' | 'pivoted' | 'dropped' | 'released';
export type LEv = { uid: number; t: LT; type: Glyph; label: string; title: string; quote: string | null; quoteBy: Ev['quote_by']; name?: string; suggested: boolean };
export type LIdea = {
  id: string; code: string; fam: string; name: string; problem: string; logo?: string; resolution: Resolution | null;
  start: LT; end: LT | null; status: Status; lane: number; events: LEv[];
};
export type LLink = { from: string; to: string; type: 'pivot' | 'spawn' | 'merge'; t: LT; suggested: boolean };
export type Fam = { key: string; name: string; color: string; ink: string };
export type Model = { cols: Col[]; ideas: LIdea[]; links: LLink[]; fams: Record<string, Fam>; now: LT };

const DAY = 86_400_000;
const PALETTE = ['--f1', '--f2', '--f3', '--f4', '--f5', '--f6'];
const LOW_CONFIDENCE = 0.6;

const GLYPH: Record<string, Glyph> = {
  born: 'born', renamed: 'rename', refined: 'rename', narrowed: 'narrowed', widened: 'narrowed',
  decided: 'decided', tried: 'decided', planned: 'decided', building: 'decided', resumed: 'decided', revived: 'decided',
  researched: 'report', attached: 'report', parked: 'parked', dropped: 'dropped', released: 'born',
  pivoted: 'decided', spawned: 'decided', merged: 'decided',
};

const dayStart = (t: number): number => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const nextDay = (t: number): number => { const d = new Date(t); d.setDate(d.getDate() + 1); return d.getTime(); };
const dayLabel = (t: number): string => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const month = (t: number): number => new Date(t).getMonth();
const shortDate = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** One column per active day; runs of quiet days collapse into one narrow column. */
function columns(times: number[], now: number): Col[] {
  const counts = new Map<number, number>();
  for (const t of times) counts.set(dayStart(t), (counts.get(dayStart(t)) ?? 0) + 1);
  const first = Math.min(...times, now);
  const cols: Col[] = [];
  let quietFrom: number | null = null;
  // Step by calendar day, not 24 h: a daylight-saving change would drift off midnight.
  for (let d = dayStart(first); d <= dayStart(now); d = nextDay(d)) {
    const n = counts.get(d) ?? 0;
    const today = d === dayStart(now);
    if (n === 0 && !today) {
      quietFrom ??= d;
      continue;
    }
    if (quietFrom !== null) {
      const days = Math.round((d - quietFrom) / DAY);
      const lastQuiet = new Date(d);
      lastQuiet.setDate(lastQuiet.getDate() - 1);
      cols.push({ k: `q${quietFrom}`, label: days === 1 ? shortDate(quietFrom) : `${shortDate(quietFrom)} – ${shortDate(lastQuiet.getTime())}`, short: '', w: Math.min(0.5, 0.18 + days * 0.03), start: quietFrom, end: d });
      quietFrom = null;
    }
    const prev = cols.findLast((c) => !c.k.startsWith('q'));
    const newMonth = prev === undefined || month(prev.start) !== month(d);
    cols.push({ k: `d${d}`, label: dayLabel(d), short: newMonth ? shortDate(d) : String(new Date(d).getDate()), w: 0.45 + Math.min(1.5, n / 5), start: d, end: nextDay(d) });
  }
  return cols;
}

export function toLT(cols: Col[], t: number): LT {
  const c = cols.find((x) => t >= x.start && t < x.end) ?? (t < (cols[0]?.start ?? 0) ? cols[0] : cols.at(-1));
  if (!c) return ['', 0];
  return [c.k, Math.max(0, Math.min(24, ((t - c.start) / (c.end - c.start)) * 24))];
}

/** Lanes ordered so an idea sits next to the one it came from; families are lineage trees. */
function lanesAndFamilies(ideas: Idea[], links: Link[]): { order: Idea[]; fam: Map<string, string> } {
  const ids = new Set(ideas.map((i) => i.id));
  const parent = new Map<string, string>();
  for (const l of links) if (ids.has(l.from_idea) && ids.has(l.to_idea) && !parent.has(l.to_idea)) parent.set(l.to_idea, l.from_idea);
  const root = (id: string): string => {
    const seen = new Set<string>();
    while (parent.has(id) && !seen.has(id)) { seen.add(id); id = parent.get(id) as string; }
    return id;
  };
  const fam = new Map(ideas.map((i) => [i.id, root(i.id)]));
  const firstOf = new Map<string, string>();
  for (const i of ideas) {
    const r = fam.get(i.id) as string;
    if (!firstOf.has(r) || i.created_at < (firstOf.get(r) as string)) firstOf.set(r, i.created_at);
  }
  const order = [...ideas].sort((a, b) =>
    (firstOf.get(fam.get(a.id) as string) ?? '').localeCompare(firstOf.get(fam.get(b.id) as string) ?? '') || a.created_at.localeCompare(b.created_at));
  return { order, fam };
}

/** An event's one-line title, naming linked ideas rather than showing their IDs. */
function titleOf(e: Ev, nameOf: (id: string) => string): string {
  const to = String(e.payload['to'] ?? e.payload['into'] ?? '');
  if (e.type === 'pivoted') return `Pivoted into ${nameOf(to)}`;
  if (e.type === 'spawned') return `Spun off ${nameOf(to)}`;
  if (e.type === 'merged') return `Merged into ${nameOf(to)}`;
  return eventDetail(e) || (EVENT_LABEL[e.type] ?? e.type);
}

export function statusGroup(s: Status): StatusGroup {
  return s === 'active' ? 'active' : s === 'dormant' || s === 'parked' ? 'quiet' : 'ended';
}

type BuildOptions = { logos?: Record<string, string>; range?: Range; groups?: ReadonlySet<StatusGroup>; reasons?: ReadonlySet<Resolution> };

/**
 * A date range keeps only activity inside it: ideas with none drop out, and lanes start where the range does.
 * A status filter drops ideas after their status is known, then re-packs the lanes.
 */
export function buildModel(allIdeas: Idea[], allByIdea: Map<string, Ev[]>, links: Link[], nowIso: string, opts: BuildOptions = {}): Model {
  const logos = opts.logos ?? {};
  const from = opts.range?.from ?? -Infinity, to = opts.range?.to ?? Infinity;
  const inRange = (iso: string): boolean => { const t = Date.parse(iso); return t >= from && t <= to; };
  const byIdea = new Map([...allByIdea].map(([id, evs]) => [id, evs.filter((e) => inRange(e.ts))]));
  const ideas = allIdeas
    .filter((i) => (byIdea.get(i.id) ?? []).some(isLive) || inRange(i.created_at))
    .map((i) => (Date.parse(i.created_at) < from ? { ...i, created_at: new Date(from).toISOString() } : i));
  const nowCap = Math.min(Date.parse(nowIso), to);
  nowIso = new Date(nowCap).toISOString();
  const now = nowCap;
  const nameOf = (id: string): string => ideas.find((i) => i.id === id)?.title ?? id;
  const live = (id: string): Ev[] => (byIdea.get(id) ?? []).filter(isLive);
  const times = ideas.flatMap((i) => [Date.parse(i.created_at), ...live(i.id).map((e) => Date.parse(e.ts))]);
  const cols = columns(times, now);
  const at = (iso: string): LT => toLT(cols, Date.parse(iso));
  const ids = new Set(ideas.map((i) => i.id));
  const inView = links.filter((l) => ids.has(l.from_idea) && ids.has(l.to_idea));
  const { order, fam } = lanesAndFamilies(ideas, inView);

  const famKeys = [...new Set(order.map((i) => fam.get(i.id) as string))];
  const fams: Record<string, Fam> = {};
  famKeys.forEach((k, n) => {
    const members = order.filter((i) => fam.get(i.id) === k);
    const color = PALETTE[n % PALETTE.length] as string;
    fams[k] = { key: k, name: members.length > 1 ? (members[0]?.title ?? k) : '', color: `var(${color})`, ink: color === '--f4' ? '#141721' : '#ffffff' };
  });

  const out: LIdea[] = order.map((i, lane) => {
    const evs = live(i.id);
    const last = Math.max(Date.parse(i.created_at), ...evs.map((e) => Date.parse(e.ts)));
    const merged = evs.some((e) => e.type === 'merged');
    const status: Status =
      i.stage === 'evolved' ? (merged ? 'merged' : 'pivoted')
        : i.stage === 'dropped' || i.stage === 'released' || i.stage === 'parked' ? i.stage
          : now - last <= 2 * DAY ? 'active' : 'dormant';
    return {
      id: i.id,
      code: (i.title.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase(),
      fam: fam.get(i.id) as string,
      ...(logos[i.id] ? { logo: logos[i.id] as string } : {}),
      resolution: i.resolution,
      name: i.title,
      problem: i.problem,
      start: at(i.created_at),
      end: i.closed_at ? at(i.closed_at) : null,
      status,
      lane,
      events: evs.map((e) => ({
        uid: e.id,
        t: at(e.ts),
        type: GLYPH[e.type] ?? 'decided',
        label: EVENT_LABEL[e.type] ?? e.type,
        title: titleOf(e, nameOf),
        quote: e.quote,
        quoteBy: e.quote_by,
        ...(e.type === 'born' ? { name: String(e.payload['title'] ?? i.title) } : {}),
        ...(e.type === 'renamed' ? { name: String(e.payload['to'] ?? '') } : {}),
        suggested: e.state === 'dotted' && (e.confidence ?? 1) < LOW_CONFIDENCE,
      })),
    };
  });

  const linkOut: LLink[] = inView.map((l) => {
    const made = (byIdea.get(l.from_idea) ?? []).find((e) => e.id === l.event_id);
    const child = ideas.find((i) => i.id === l.to_idea);
    return {
      from: l.from_idea, to: l.to_idea, type: l.type,
      t: at(made?.ts ?? child?.created_at ?? nowIso),
      suggested: made !== undefined && made.state === 'dotted' && (made.confidence ?? 1) < LOW_CONFIDENCE,
    };
  });

  // Reasons narrow only the ended ideas; with none chosen, every ended idea counts.
  const reasonOk = (d: LIdea): boolean => statusGroup(d.status) !== 'ended' || !opts.reasons?.size || (d.resolution !== null && opts.reasons.has(d.resolution));
  const shown = (opts.groups && opts.groups.size > 0 ? out.filter((d) => opts.groups?.has(statusGroup(d.status))) : out).filter(reasonOk);
  shown.forEach((d, lane) => { d.lane = lane; });
  const kept = new Set(shown.map((d) => d.id));
  return { cols, ideas: shown, links: linkOut.filter((l) => kept.has(l.from) && kept.has(l.to)), fams, now: toLT(cols, now) };
}
