/** Hosts the d3 lens: filters, replay, zoom, the canvas and the time strip. */

import { useEffect, useRef, useState } from 'react';
import { Lens, type Caption } from '../lens/lens';
import { statusGroup, type Model, type StatusGroup } from '../lens/model';
import { RESOLUTION_COLOR, RESOLUTION_LABEL, saidBy } from '../lib/derive';
import type { Resolution } from '../lib/types';
import { DateRange } from '../components/DateRange';
import { useStore } from '../store';
import { post } from '../lib/api';
import { IdeaMark } from '../components/IdeaMark';

const QUIET = new Set(['dormant', 'parked']);
const STATUS_COLOR: Record<string, string> = {
  active: 'var(--good)', dormant: 'var(--s-exploring)', parked: 'var(--warn)', released: 'var(--s-released)',
  pivoted: 'var(--accent)', merged: 'var(--ai)', dropped: 'var(--bad)',
};
const ENDED = new Set(['merged', 'pivoted', 'dropped', 'released']);

/** Tells the opt-in daily count this was used today; the server keeps it only if sharing is on. */
const used = (feature: 'lineage' | 'replay'): void => void post('/api/used', { feature }).catch(() => undefined);

export function Lineage({ mode, model, all }: { mode: 'river' | 'constellation'; model: Model; all: Model }) {
  const { selected, openEvent, select, snap } = useStore();
  const stage = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const strip = useRef<SVGSVGElement | null>(null);
  const tip = useRef<HTMLDivElement | null>(null);
  const lens = useRef<Lens | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  useEffect(() => used('lineage'), []);
  const [replaying, setReplaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const setReel = useStore((s) => s.setReel);

  // The lens lives as long as this view; a mode change morphs it rather than remounting.
  useEffect(() => {
    if (!stage.current || !svg.current || !strip.current || !tip.current) return;
    const l = new Lens(stage.current, svg.current, strip.current, tip.current, mode, {
      select: (id) => select(id),
      openEvent: (idea, uid) => select(idea, uid),
    });
    // Scrubbing tells the story up to the playhead in the side panel; going back to now returns the overview.
    l.onAsOf = (at) => {
      setAsOf(at);
      if (l.replaying) return;
      if (at === null) setReel(null);
      else if (l.scrubbing) setReel(l.momentsUntil());
    };
    l.onReplay = (on) => { setReplaying(on); setPaused(false); if (on) { setReel([]); used('replay'); } };
    l.onPaused = setPaused;
    l.onCaption = (c) => { if (c) setReel((r) => [...r, c]); };
    lens.current = l;
    return () => { l.destroy(); lens.current = null; setReel(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { lens.current?.update(model, selected, openEvent); }, [model, selected, openEvent]);
  useEffect(() => { lens.current?.setView(mode); }, [mode]);
  useEffect(() => {
    if (!replaying) return;
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') stop();
      else if (e.key === ' ') { e.preventDefault(); lens.current?.pauseReplay(); }
      else if (e.key === 'ArrowRight') lens.current?.nextMoment();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [replaying]);

  const stop = (): void => { lens.current?.backToNow(); setReel(null); };
  const { groups, toggleGroup, reasons, toggleReason } = useStore();
  const endedReasons = [...new Set(all.ideas.filter((d) => statusGroup(d.status) === 'ended' && d.resolution).map((d) => d.resolution as Resolution))];
  const n = (g: StatusGroup): number => all.ideas.filter((d) => statusGroup(d.status) === g).length;
  const events = model.ideas.reduce((a, d) => a + d.events.length, 0);
  const questions = snap?.questions.length ?? 0;
  const chip = (g: StatusGroup, label: string) => (
    <button className={`chip ${g}`} aria-pressed={groups.has(g)} onClick={() => toggleGroup(g)} title={`Show only ${label} ideas; click more to combine`}>
      <b>{n(g)}</b>{label}
    </button>
  );

  return (
    <div className="lineage">
      <div className="lin-bar">
        <div className="filters-row" role="toolbar" aria-label="Filter ideas">
          <button className="chip" aria-pressed={groups.size === 0} onClick={() => toggleGroup(null)} title="Show every idea">
            <b>{all.ideas.length}</b>ideas
          </button>
          {chip('active', 'active')}
          {chip('quiet', 'quiet')}
          {chip('ended', 'ended')}
          {groups.has('ended') && endedReasons.length > 1 && (
            <span className="reasons" role="group" aria-label="Why they ended">
              {endedReasons.map((r) => (
                <button key={r} className="chip reason" aria-pressed={reasons.has(r)} onClick={() => toggleReason(r)} style={{ ['--c' as string]: RESOLUTION_COLOR[r] }}>
                  {RESOLUTION_LABEL[r]}
                </button>
              ))}
            </span>
          )}
          <span className="divider" />
          <DateRange />
          <span className="muted-count">{events} events</span>
          {questions > 0 && <span className="ask"><b>{questions}</b>{questions === 1 ? 'question' : 'questions'} for you</span>}
        </div>
        <div className="lin-right">
          {asOf && !replaying && <button className="btn small ghost" onClick={() => lens.current?.backToNow()}>Back to now</button>}
          {replaying ? (
            <div className="player" role="group" aria-label="Replay controls">
              <button className="btn small" onClick={() => lens.current?.pauseReplay()} title="Pause or resume (space)">{paused ? '▶ Resume' : '❚❚ Pause'}</button>
              <button className="btn small" onClick={() => lens.current?.nextMoment()} title="Next key moment (→)">Next ›</button>
              <button className="btn small ghost" onClick={stop} title="Stop (Esc)">■ Stop</button>
            </div>
          ) : (
            <button className="btn small" onClick={() => lens.current?.replay()} title="Watch your ideas unfold">▶ Replay</button>
          )}
        </div>
      </div>
      <div className={`lin-canvas${replaying ? ' cinema' : ''}`}>
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

/** During a replay the side panel becomes a timelapse: moments stack top to bottom as they play, louder ones bigger. */
function Reel({ reel }: { reel: Caption[] }) {
  const { select, setReel } = useStore();
  const box = useRef<HTMLDivElement | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);

  // A new moment grows into place, so follow it for as long as it grows rather than jumping once.
  useEffect(() => {
    const el = box.current, t = tail.current;
    if (!el || !t) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.scrollTop = el.scrollHeight; return; }
    let raf = 0;
    const until = performance.now() + 1600;
    const follow = (): void => {
      const target = Math.max(0, t.offsetTop + t.offsetHeight - el.clientHeight * 0.85);
      el.scrollTop += (target - el.scrollTop) * 0.1;
      if (performance.now() < until) raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [reel.length]);

  const last = reel.length - 1;
  return (
    <aside className="panel overview reel" aria-label="Replay">
      <div className="reel-head">
        <span className="eyebrow">Replay</span>
        <button className="btn small ghost" onClick={() => setReel(null)} title="Back to the overview">Close</button>
      </div>
      <div className="panel-body reel-scroll" ref={box}>
        <ol className="reel-list" aria-live="polite">
          {reel.length === 0 && <li className="reel-wait">Rewinding…</li>}
          {reel.map((c, i) => (
            <li key={c.step} className={`moment w${c.weight}${i === last ? ' now' : ''}`} style={{ ['--cc' as string]: c.color }}>
              <div className="moment-in">
                <span className="beat" aria-hidden="true" />
                <div className="when">{c.when}</div>
                <button className="who" onClick={() => select(c.ideaId)}>
                  <IdeaMark color={c.color} logo={c.logo} size={c.weight === 3 ? 26 : 18} />
                  <span><b>{c.what}</b> · {c.idea}</span>
                </button>
                {c.detail && <div className="detail">{c.detail}</div>}
                {c.quote && <blockquote>“{c.quote}”<cite>— {saidBy(c.quoteBy).credit}</cite></blockquote>}
              </div>
            </li>
          ))}
          <div className="reel-tail" ref={tail} aria-hidden="true" />
        </ol>
      </div>
    </aside>
  );
}

export function Overview({ model }: { model: Model }) {
  const select = useStore((s) => s.select);
  const reel = useStore((s) => s.reel);
  if (reel) return <Reel reel={reel} />;
  const groups = [
    { title: 'Active', list: model.ideas.filter((d) => d.status === 'active') },
    { title: 'Quiet', list: model.ideas.filter((d) => QUIET.has(d.status)) },
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
                  {d.resolution && d.resolution !== 'released' && statusGroup(d.status) === 'ended'
                    ? <span className="ov-st" style={{ ['--sc' as string]: RESOLUTION_COLOR[d.resolution] }}>{RESOLUTION_LABEL[d.resolution]}</span>
                    : <span className="ov-st" style={{ ['--sc' as string]: STATUS_COLOR[d.status] }}>{d.status === 'dormant' ? 'quiet' : d.status}</span>}
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
