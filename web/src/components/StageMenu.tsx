/** The stage badge doubles as the lifecycle menu: where an idea stands, and how to move it. */

import { useEffect, useRef, useState } from 'react';
import { DROP_REASONS, RESOLUTION_LABEL, STAGE_LABEL, stageMoves } from '../lib/derive';
import type { Idea, Resolution } from '../lib/types';
import { useStore } from '../store';

export function StageMenu({ idea }: { idea: Idea }) {
  const act = useStore((s) => s.act);
  const [open, setOpen] = useState<false | 'moves' | 'reasons'>(false);
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

  const move = (type: string, label: string, reason?: Resolution): void => {
    setOpen(false);
    void act(`/api/ideas/${idea.id}/stage`, { type, why: '', ...(reason ? { reason } : {}) }, `${label}: ${idea.title}`);
  };

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
            <button key={r.reason} role="menuitem" onClick={() => move('dropped', `Dropped (${RESOLUTION_LABEL[r.reason]})`, r.reason)}>
              <span>{RESOLUTION_LABEL[r.reason]}</span>
              <small>{r.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
