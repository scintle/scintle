/** Hosts the d3 lens: stats, the view's question, replay, zoom, the canvas and the time strip. */

import { useEffect, useRef, useState } from 'react';
import { Lens } from '../lens/lens';
import type { LIdea, Model } from '../lens/model';
import { useStore } from '../store';
import { IdeaMark } from '../components/IdeaMark';

const QUESTION = { river: 'Where did each idea end up, and when?', constellation: "What's related to what?" };
const QUIET = new Set(['dormant', 'parked']);
const STATUS_COLOR: Record<string, string> = {
  active: 'var(--good)', dormant: 'var(--s-exploring)', parked: 'var(--warn)', released: 'var(--s-released)',
  pivoted: 'var(--accent)', merged: 'var(--ai)', dropped: 'var(--bad)',
};
const ENDED = new Set(['merged', 'pivoted', 'dropped', 'released']);

export function Lineage({ mode, model }: { mode: 'river' | 'constellation'; model: Model }) {
  const { selected, openEvent, select, snap } = useStore();
  const stage = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const strip = useRef<SVGSVGElement | null>(null);
  const tip = useRef<HTMLDivElement | null>(null);
  const lens = useRef<Lens | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  // The lens lives as long as this view; a mode change morphs it rather than remounting.
  useEffect(() => {
    if (!stage.current || !svg.current || !strip.current || !tip.current) return;
    const l = new Lens(stage.current, svg.current, strip.current, tip.current, mode, {
      select: (id) => select(id),
      openEvent: (idea, uid) => select(idea, uid),
    });
    l.onAsOf = setAsOf;
    l.onReplay = setReplaying;
    lens.current = l;
    return () => { l.destroy(); lens.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { lens.current?.update(model, selected, openEvent); }, [model, selected, openEvent]);
  useEffect(() => { lens.current?.setView(mode); }, [mode]);

  const n = (f: (d: LIdea) => boolean): number => model.ideas.filter(f).length;
  const events = model.ideas.reduce((a, d) => a + d.events.length, 0);
  const questions = snap?.questions.length ?? 0;

  return (
    <div className="lineage">
      <div className="lin-bar">
        <div className="stats">
          <span><b>{model.ideas.length}</b>ideas</span>
          <span className="on"><b>{n((d) => d.status === 'active')}</b>active</span>
          <span className="quiet"><b>{n((d) => QUIET.has(d.status))}</b>quiet or parked</span>
          <span><b>{n((d) => ENDED.has(d.status))}</b>ended</span>
          <span><b>{events}</b>events</span>
          {questions > 0 && <span className="ask"><b>{questions}</b>{questions === 1 ? 'question' : 'questions'} for you</span>}
        </div>
        <div className="lin-right">
          <div className="viewq"><b>{mode === 'river' ? 'River' : 'Constellation'}</b> · {QUESTION[mode]}</div>
          {asOf && !replaying && <button className="btn small ghost" onClick={() => lens.current?.backToNow()}>Back to now</button>}
          <button className="btn small" onClick={() => lens.current?.replay()}>{replaying ? '■ Stop' : '▶ Replay'}</button>
        </div>
      </div>
      <div className="lin-canvas">
        <div className="stage-scroll">
          <div className="stage" ref={stage}>
            <svg ref={svg} className="lens-svg" role="img" aria-label={mode === 'river' ? 'Ideas over time' : 'How ideas relate'} />
            <div className="tip" ref={tip} hidden />
          </div>
        </div>
        <div className="zoom">
          <button onClick={() => lens.current?.zoomBy(1 / 1.7)} aria-label="Zoom out" title="Zoom out (−)">−</button>
          <button onClick={() => lens.current?.zoomBy(1.7)} aria-label="Zoom in" title="Zoom in (+ or ⌘-scroll up)">＋</button>
          <button className="wide" onClick={() => lens.current?.fit()} title="Fit everything (0)">Fit</button>
        </div>
        <div className="strip-wrap">
          <span className="cap">{asOf ? `As of ${asOf} · hold ⇧ to see what comes next` : 'Time · drag the pink handle to travel'}</span>
          <svg ref={strip} className="strip" aria-label="Time strip" />
        </div>
      </div>
    </div>
  );
}

export function Overview({ model }: { model: Model }) {
  const select = useStore((s) => s.select);
  const groups = [
    { title: 'Active', list: model.ideas.filter((d) => d.status === 'active') },
    { title: 'Quiet or parked', list: model.ideas.filter((d) => QUIET.has(d.status)) },
    { title: 'Ended', list: model.ideas.filter((d) => ENDED.has(d.status)) },
  ];
  return (
    <aside className="panel overview" aria-label="Overview">
      <div className="panel-body">
        {groups.map((g) => g.list.length > 0 && (
          <section key={g.title}>
            <div className="ov-h">{g.title}<span className="n">{g.list.length}</span></div>
            {g.list.map((d) => {
              const fam = model.fams[d.fam];
              return (
                <button key={d.id} className="ov-row" onClick={() => select(d.id)}>
                  <IdeaMark color={fam?.color ?? 'var(--accent)'} logo={d.logo} size={22} />
                  <span className="ov-name">{d.name}</span>
                  <span className="ov-st" style={{ ['--sc' as string]: STATUS_COLOR[d.status] }}>{d.status === 'dormant' ? 'quiet' : d.status}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
