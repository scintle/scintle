/** Date-range filter: presets plus a custom from/to. Lineage shows only activity inside the range. */

import { useEffect, useRef, useState } from 'react';
import { useStore, type RangeChoice } from '../store';

const PRESETS: { label: string; choice: RangeChoice }[] = [
  { label: 'Last 7 days', choice: { kind: 'last', days: 7 } },
  { label: 'Last 30 days', choice: { kind: 'last', days: 30 } },
  { label: 'Last 90 days', choice: { kind: 'last', days: 90 } },
  { label: 'All time', choice: { kind: 'all' } },
];

const day = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const iso = (t: number | null): string => (t === null ? '' : new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10));

export function rangeLabel(r: RangeChoice): string {
  if (r.kind === 'all') return 'All time';
  if (r.kind === 'last') return `Last ${r.days} days`;
  return `${r.from === null ? 'Start' : day(r.from)} – ${r.to === null ? 'now' : day(r.to)}`;
}

export function DateRange() {
  const { range, setRange } = useStore();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.kind === 'custom' ? iso(range.from) : '');
  const [to, setTo] = useState(range.kind === 'custom' ? iso(range.to) : '');
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);

  const pick = (r: RangeChoice): void => { setRange(r); setOpen(false); };
  const applyCustom = (): void => {
    // The end date is inclusive: the range runs to the end of that day.
    const f = from ? new Date(`${from}T00:00`).getTime() : null;
    const t = to ? new Date(`${to}T23:59:59`).getTime() : null;
    if (f !== null && t !== null && f > t) return;
    pick({ kind: 'custom', from: f, to: t });
  };

  return (
    <div className="range" ref={box}>
      <button className={`chip${range.kind === 'all' ? '' : ' on-filter'}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        {rangeLabel(range)}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="menu range-menu" role="menu">
          {PRESETS.map((p) => (
            <button key={p.label} role="menuitemradio" aria-checked={rangeLabel(range) === p.label} onClick={() => pick(p.choice)}>
              <span>{p.label}</span>
            </button>
          ))}
          <div className="custom">
            <span className="eyebrow">Custom</span>
            <div className="dates">
              <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            <button className="btn small" disabled={!from && !to} onClick={applyCustom}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
