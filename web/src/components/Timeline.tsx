import { useEffect, useMemo, useState } from 'react';
import { EVENT_GROUP, EVENT_LABEL, eventDetail, isLive, saidBy } from '../lib/derive';
import type { Ev, Source } from '../lib/types';
import { useStore } from '../store';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shape', label: 'Shaping' },
  { id: 'decide', label: 'Decisions' },
  { id: 'try', label: 'Tried' },
  { id: 'life', label: 'Lifecycle' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

const COLOR: Record<string, string> = { shape: 'var(--accent)', decide: 'var(--ai)', try: 'var(--s-building)', life: 'var(--good)' };
const CORRECTABLE = ['renamed', 'narrowed', 'widened', 'refined', 'decided', 'tried', 'pivoted', 'spawned', 'planned', 'building', 'parked', 'dropped', 'released', 'attached'];
const DAY = 86_400_000;

const when = (ts: string): string =>
  new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function SourceLine({ e, sources }: { e: Ev; sources: Record<string, Source> }) {
  if (e.session_id === null) return <span>made on the board</span>;
  const s = sources[e.session_id];
  if (s?.doc) return <span title={s.doc}>from document {s.doc.split('/').slice(-2).join('/')}{s.state === 'deleted' ? ' · file deleted · excerpt saved' : ''}</span>;
  const id = `session ${e.session_id.slice(0, 8)}${e.turn_seq !== null ? ` · turn ${e.turn_seq}` : ''}`;
  if (s?.state === 'deleted') return <span>{id} · source chat deleted (30-day cleanup) · excerpt saved</span>;
  if (s?.state === 'expiring') return <span>{id} · chat expires in {s.expiresInDays} {s.expiresInDays === 1 ? 'day' : 'days'}</span>;
  return <span title={`claude --resume ${e.session_id}`}>{id} · <code>claude --resume {e.session_id.slice(0, 8)}…</code></span>;
}

function EventCard({ e, sources, version }: { e: Ev; sources: Record<string, Source>; version: number }) {
  const act = useStore((s) => s.act);
  const [type, setType] = useState(e.type);
  const removed = e.state === 'removed';
  return (
    <div className="ev-card">
      {e.quote && <blockquote>“{e.quote}”<cite>— {saidBy(e.quote_by).credit}</cite></blockquote>}
      {e.excerpt && <pre>{e.excerpt}</pre>}
      <div className="prov">
        <span>{e.origin === 'user' ? 'you' : `inferred${e.confidence !== null ? ` · ${Math.round(e.confidence * 100)}%` : ''}`}</span>
        <span>{e.state === 'dotted' ? 'not yet checked' : e.state}</span>
        <SourceLine e={e} sources={sources} />
        {e.type === 'planned' && typeof e.payload['briefVersion'] === 'number' && version > e.payload['briefVersion'] && (
          <span className="pill warn">idea changed {version - e.payload['briefVersion']}× since this plan</span>
        )}
      </div>
      <div className="acts">
        {removed ? (
          <button className="btn small" onClick={() => void act(`/api/events/${e.id}/confirm`, {}, 'Restored')}>Restore</button>
        ) : (
          <>
            {e.state === 'dotted' && <button className="btn small" onClick={() => void act(`/api/events/${e.id}/confirm`, {}, 'Kept')}>Keep</button>}
            <button className="btn small" onClick={() => void act(`/api/events/${e.id}/remove`, {}, 'Removed from the timeline')}>Not this</button>
            {e.type !== 'born' && (
              <label className="acts">
                <span className="sr-only">Change type</span>
                <select value={type} onChange={(x) => setType(x.target.value)}>
                  {CORRECTABLE.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
                </select>
                {type !== e.type && (
                  <button className="btn small" onClick={() => void act(`/api/events/${e.id}/correct`, { type, payload: e.payload }, `Changed to ${EVENT_LABEL[type]}`)}>
                    Change
                  </button>
                )}
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function Timeline({ events }: { events: Ev[] }) {
  const { snap, openEvent, setOpenEvent } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const sources = snap?.sources ?? {};
  const nameOf = (id: string): string => snap?.ideas.find((i) => i.id === id)?.title ?? id;
  const shown = useMemo(
    () => events.filter((e) => !e.superseded && (filter === 'all' || EVENT_GROUP[e.type] === filter)),
    [events, filter],
  );

  useEffect(() => {
    const onKey = (k: KeyboardEvent): void => {
      if (openEvent === null || (k.key !== 'ArrowRight' && k.key !== 'ArrowLeft')) return;
      if (k.target instanceof HTMLSelectElement || k.target instanceof HTMLInputElement) return;
      const i = shown.findIndex((e) => e.id === openEvent);
      const next = shown[i + (k.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        setOpenEvent(next.id);
        document.getElementById(`ev-${next.id}`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEvent, shown, setOpenEvent]);

  return (
    <>
      <div className="filters" role="toolbar" aria-label="Filter events">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {shown.length === 0 && <p className="state" style={{ height: 'auto' }}>No events of this kind yet.</p>}
      <ol className="tl">
        {shown.map((e, i) => {
          const prev = shown[i - 1];
          const quiet = prev ? Math.floor((Date.parse(e.ts) - Date.parse(prev.ts)) / DAY) : 0;
          const open = openEvent === e.id;
          const settled = e.origin === 'user' || e.state === 'confirmed';
          const cls = ['ev', settled ? 'settled' : '', isLive(e) ? '' : 'removed'].join(' ');
          return (
            <li key={e.id} id={`ev-${e.id}`}>
              {quiet >= 3 && <div className="gap">{quiet} days quiet</div>}
              <div className={cls} aria-expanded={open} style={{ ['--c' as string]: COLOR[EVENT_GROUP[e.type] ?? 'shape'] }}>
                <span className="node" />
                <button className="ev-row" onClick={() => setOpenEvent(open ? null : e.id)}>
                  <div className="top">
                    <span className="type">{EVENT_LABEL[e.type] ?? e.type}</span>
                    <span className="when">{when(e.ts)}</span>
                  </div>
                  {eventDetail(e, nameOf) && <div className="detail">{eventDetail(e, nameOf)}</div>}
                </button>
                {open && <EventCard e={e} sources={sources} version={events.filter(isLive).length} />}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
