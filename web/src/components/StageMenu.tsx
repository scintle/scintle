/** The stage badge doubles as the lifecycle menu: where an idea stands, and how to move it. */

import { useEffect, useRef, useState } from 'react';
import { DROP_REASONS, RESOLUTION_LABEL, STAGE_LABEL, stageMoves } from '../lib/derive';
import type { Idea, Resolution } from '../lib/types';
import { useStore } from '../store';

export function StageMenu({ idea }: { idea: Idea }) {
  const act = useStore((s) => s.act);
  const [open, setOpen] = useState<false | 'moves' | 'reasons' | { reason: Resolution }>(false);
  const [why, setWhy] = useState('');
  const box = useRef<HTMLDivElement | null>(null);
  const moves = stageMoves(idea.stage);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);

  const move = (type: string, label: string, reason?: Resolution, note = ''): void => {
    setOpen(false);
    setWhy('');
    void act(`/api/ideas/${idea.id}/stage`, { type, why: note, ...(reason ? { reason } : {}) }, `${label}: ${idea.title}`);
  };
  const drop = (reason: Resolution, note: string): void => move('dropped', `Dropped (${RESOLUTION_LABEL[reason]})`, reason, note);

  return (
    <div className="stage-menu" ref={box}>
      <button className="stage-badge" aria-haspopup="menu" aria-expanded={open !== false} onClick={() => setOpen(open ? false : 'moves')} style={{ ['--sc' as string]: `var(--s-${idea.stage})` }}>
        <i />{STAGE_LABEL[idea.stage]}{idea.resolution && idea.stage !== 'released' ? ` · ${RESOLUTION_LABEL[idea.resolution]}` : ''}
        <svg className="caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open === 'moves' && (
        <div className="menu" role="menu">
          {moves.map((m) => (
            <button key={m.label} role="menuitem" onClick={() => (m.drop ? setOpen('reasons') : move(m.type, m.label))}>
              <span>{m.label}</span>
              <small>{m.hint}</small>
            </button>
          ))}
        </div>
      )}
      {open === 'reasons' && (
        <div className="menu" role="menu" aria-label="Why drop it?">
          <div className="menu-title eyebrow">Why drop it?</div>
          {DROP_REASONS.map((r) => (
            <button key={r.reason} role="menuitem" onClick={() => setOpen({ reason: r.reason })}>
              <span>{RESOLUTION_LABEL[r.reason]}</span>
              <small>{r.hint}</small>
            </button>
          ))}
        </div>
      )}
      {typeof open === 'object' && (
        // The reason alone says little a year later; one line in the person's own words says why.
        <form className="menu why" aria-label="Anything to remember?" onSubmit={(e) => { e.preventDefault(); drop(open.reason, why); }}>
          <div className="menu-title eyebrow">Dropping as {RESOLUTION_LABEL[open.reason].toLowerCase()}</div>
          <label htmlFor={`why-${idea.id}`}>Anything to remember? <small>optional</small></label>
          <textarea
            id={`why-${idea.id}`} autoFocus rows={2} maxLength={500} value={why}
            placeholder={WHY_HINT[open.reason]}
            onChange={(e) => setWhy(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); drop(open.reason, why); } }}
          />
          <div className="why-actions">
            <button type="button" className="btn ghost small" onClick={() => drop(open.reason, '')}>Skip</button>
            <button type="submit" className="btn primary small">Drop it</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** A nudge toward the kind of note that helps later: the specific thing, not the category again. */
const WHY_HINT: Record<Resolution, string> = {
  'not-interested': 'e.g. fun to think about, but not something I want to build',
  crowded: 'e.g. two free apps already do this well',
  'no-demand': 'e.g. asked five teachers; none would pay',
  'not-feasible': 'e.g. needs data nobody publishes',
  released: '', pivoted: '', merged: '', other: 'What made you stop?',
};
