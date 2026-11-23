/** The stage badge doubles as the lifecycle menu: where an idea stands, and how to move it. */

import { useEffect, useRef, useState } from 'react';
import { STAGE_LABEL, stageMoves } from '../lib/derive';
import type { Idea } from '../lib/types';
import { useStore } from '../store';

export function StageMenu({ idea }: { idea: Idea }) {
  const act = useStore((s) => s.act);
  const [open, setOpen] = useState(false);
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

  return (
    <div className="stage-menu" ref={box}>
      <button className="stage-badge" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} style={{ ['--sc' as string]: `var(--s-${idea.stage})` }}>
        <i />{STAGE_LABEL[idea.stage]}<svg className="caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="menu" role="menu">
          {moves.map((m) => (
            <button key={m.type} role="menuitem" onClick={() => { setOpen(false); void act(`/api/ideas/${idea.id}/stage`, { type: m.type, why: '' }, `${m.label}: ${idea.title}`); }}>
              <span>{m.label}</span>
              <small>{m.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
