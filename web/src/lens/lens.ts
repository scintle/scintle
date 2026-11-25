/**
 * The lineage canvas: River (time) and Constellation (relation) drawn by d3, ported from the v3 mock.
 * React owns everything around it; this owns the two SVGs, their zoom, the time strip and the morph.
 */

import * as d3 from 'd3';
import { saidBy } from '../lib/derive';
import type { Col, Fam, Glyph, LEv, LIdea, LLink, LT, Model, Status } from './model';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sel = d3.Selection<any, any, any, any>;
export type View = 'river' | 'constellation';
export type Caption = {
  when: string; what: string; idea: string; ideaId: string; logo?: string | undefined; detail: string; quote: string | null; quoteBy: LEv['quoteBy'];
  color: string; step: number; total: number; weight: 1 | 2 | 3;
};
/** Moments a replay slows down for. Everything else ticks past. */
/** Key moments and how loudly each plays: 3 begins or ends a story, 2 turns it, 1 nudges it. */
const KEY_MOMENTS = new Map<string, 1 | 2 | 3>([
  ['Born', 3], ['Pivoted', 3], ['Merged', 3], ['Released', 3], ['Dropped', 3],
  ['Renamed', 2], ['Spawned', 2], ['Planned', 2], ['Building started', 2], ['Revived', 2],
  ['Narrowed', 1], ['Parked', 1],
]);
type Hooks = { select: (id: string | null) => void; openEvent: (ideaId: string, uid: number) => void };
type Hl = { ids: Set<string>; links: Set<LLink>; order: string[] };

const STATUSWORD: Record<Status, string> = { active: 'active', dormant: 'quiet', parked: 'parked', merged: 'merged', pivoted: 'pivoted', dropped: 'dropped', released: 'released' };
const LINKWORD = { spawn: 'spun off', pivot: 'pivoted', merge: 'merged' } as const;
const RESOLUTION_WORD: Record<string, string> = { 'not-interested': 'not interested', crowded: 'crowded', 'no-demand': 'no demand', 'not-feasible': 'not feasible' };
const ENDED: Status[] = ['merged', 'pivoted', 'dropped', 'released'];
const R = { PADL: 24, PADR: 210, TOP: 62, LANE: 52 };
const POS_KEY = 'scintle.lens.pos';
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const reduceMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const dur = (ms: number): number => (reduceMotion() ? 0 : ms);
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const rnd = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 100000) / 100000; };

function glyph(g: Sel, type: Glyph, col: string, suggested: boolean): void {
  const st = 'stroke:var(--surface);stroke-width:2';
  if (type === 'born') g.append('circle').attr('r', 6).attr('style', `fill:${col};${st}`);
  else if (type === 'rename') g.append('circle').attr('r', 4.6).attr('style', `fill:var(--surface);stroke:${col};stroke-width:2.2`);
  else if (type === 'narrowed') g.append('path').attr('d', 'M-5,-6 L5,0 L-5,6 Z').attr('style', `fill:${col};${st};stroke-linejoin:round`);
  else if (type === 'decided') g.append('path').attr('d', 'M0,-6.5 L6.5,0 L0,6.5 L-6.5,0 Z').attr('style', `fill:${col};${st};stroke-linejoin:round`);
  else if (type === 'report') {
    g.append('rect').attr('x', -4.5).attr('y', -5.5).attr('width', 9).attr('height', 11).attr('rx', 1.6).attr('style', `fill:var(--surface);stroke:${col};stroke-width:1.7`);
    g.append('path').attr('d', 'M-2,-1.5H2M-2,1.5H2').attr('style', `stroke:${col};stroke-width:1.3`);
  } else if (type === 'parked') {
    g.append('circle').attr('r', 7).attr('style', `fill:var(--surface);stroke:${col};stroke-width:1.8`);
    g.append('path').attr('d', 'M-2,-3V3M2,-3V3').attr('style', `stroke:${col};stroke-width:2;stroke-linecap:round`);
  } else {
    g.append('circle').attr('r', 7).attr('style', `fill:var(--surface);stroke:${col};stroke-width:1.8`);
    g.append('path').attr('d', 'M-2.8,-2.8L2.8,2.8M2.8,-2.8L-2.8,2.8').attr('style', `stroke:${col};stroke-width:2;stroke-linecap:round`);
  }
  if (suggested) {
    g.attr('opacity', 0.6);
    g.append('circle').attr('r', 10).attr('style', `fill:none;stroke:${col};stroke-width:1.2;stroke-dasharray:2 2.5`);
  }
}

function card(g: Sel, x: number, y: number, parts: [string, string?][], kind: string, anchor: 'start' | 'middle'): void {
  const t = g.append('text').attr('class', 'card-t').attr('y', y + 4);
  for (const [s, c] of parts) { const sp = t.append('tspan').text(s); if (c) sp.attr('class', c); }
  const w = (t.node() as SVGTextElement).getComputedTextLength() + 22;
  const x0 = anchor === 'start' ? x : x - w / 2;
  t.attr('x', x0 + 11);
  g.insert('rect', 'text').attr('class', `card-r ${kind}`).attr('x', x0).attr('y', y - 11).attr('width', w).attr('height', 22).attr('rx', 11);
}

export class Lens {
  private m: Model = { cols: [], ideas: [], links: [], fams: {}, now: ['', 0] };
  private byId = new Map<string, LIdea>();
  view: View;
  private sel: string | null = null;
  private openEv: number | null = null;
  private hl: Hl | null = null;
  private asOf: number | null = null;
  private ghost = false;
  private ghostDraw = false;
  private depth = 2;
  private hoverLane: string | null = null;
  private rz = d3.zoomIdentity;
  private stripX: ReturnType<Lens['makeX']> | null = null;
  private cz = d3.zoomIdentity;
  private pos: Record<string, { x: number; y: number }> = {};
  private morphing = false;
  private replayTimer: number | null = null;
  private runId = 0;
  private paused = false;
  private skip = false;
  private wake: (() => void) | undefined;
  private raf = 0;
  private svg: Sel;
  private strip: Sel;
  private zoomR: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private zoomC: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private readonly stage: HTMLDivElement;
  private readonly svgEl: SVGSVGElement;
  private readonly tip: HTMLDivElement;
  private readonly hooks: Hooks;
  private readonly cleanups: (() => void)[] = [];
  onAsOf: (label: string | null) => void = () => {};
  onReplay: (on: boolean) => void = () => {};
  onPaused: (paused: boolean) => void = () => {};
  onCaption: (c: Caption | null) => void = () => {};

  constructor(stage: HTMLDivElement, svgEl: SVGSVGElement, stripEl: SVGSVGElement, tip: HTMLDivElement, view: View, hooks: Hooks) {
    this.stage = stage;
    this.svgEl = svgEl;
    this.tip = tip;
    this.hooks = hooks;
    this.view = view;
    this.svg = d3.select(svgEl);
    this.strip = d3.select(stripEl);
    // The whole strip is a scrubber: press anywhere and drag, like a video's progress bar.
    this.strip.style('cursor', 'ew-resize').call(d3.drag<SVGSVGElement, unknown>().container(stripEl)
      .on('start drag', (ev) => this.scrubTo(ev.x)) as any);
    try { this.pos = JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') as typeof this.pos; } catch { this.pos = {}; }

    const zFilter = (ev: any): boolean => (ev.type === 'wheel' ? ev.ctrlKey || ev.metaKey : ev.type === 'dblclick' ? false : !ev.ctrlKey && !ev.button);
    // A pinch arrives as ctrl+wheel and keeps d3's direction. ⌘+scroll follows the fingers: up zooms in.
    const wheelDelta = (ev: WheelEvent): number => {
      const unit = ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002;
      return ev.ctrlKey ? -ev.deltaY * unit * 10 : ev.deltaY * unit;
    };
    this.zoomR = d3.zoom<SVGSVGElement, unknown>().scaleExtent([1, 60]).filter(zFilter).wheelDelta(wheelDelta)
      .constrain((t) => { const W = this.W(); return d3.zoomIdentity.translate(clamp(t.x, W - W * t.k, 0), 0).scale(t.k); })
      .on('zoom', (ev) => { this.rz = ev.transform; this.schedule(); });
    this.zoomC = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 4]).filter(zFilter).wheelDelta(wheelDelta)
      .on('zoom', (ev) => { this.cz = ev.transform; this.schedule(); });
    this.bindZoom();

    const wheel = (ev: WheelEvent): void => {
      if (ev.ctrlKey || ev.metaKey) return;
      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) && Math.abs(ev.deltaX) > 1) {
        ev.preventDefault();
        const k = this.view === 'river' ? this.rz.k : this.cz.k;
        this.curZoom().translateBy(this.svg as any, -ev.deltaX / k, 0);
      }
    };
    svgEl.addEventListener('wheel', wheel, { passive: false });
    const keys = (ev: KeyboardEvent): void => {
      const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
      if (ev.type === 'keydown' && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !document.querySelector('[role="dialog"]')) {
        if (ev.key === '+' || ev.key === '=') { this.zoomBy(1.5); return; }
        if (ev.key === '-' || ev.key === '_') { this.zoomBy(1 / 1.5); return; }
        if (ev.key === '0') { this.fit(); return; }
      }
      if (ev.key !== 'Shift' || this.asOf === null) return;
      const on = ev.type === 'keydown';
      if (on !== this.ghost) { this.ghost = on; this.render(); }
    };
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', keys);
    const ro = new ResizeObserver(() => { this.rz = d3.zoomIdentity; this.cz = d3.zoomIdentity; this.bindZoom(); this.render(); });
    ro.observe(stage);
    this.cleanups.push(() => svgEl.removeEventListener('wheel', wheel), () => window.removeEventListener('keydown', keys), () => window.removeEventListener('keyup', keys), () => ro.disconnect());
  }

  destroy(): void {
    this.stopReplay(false);
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanups) c();
    this.svg.on('.zoom', null);
  }

  update(m: Model, sel: string | null, openEv: number | null): void {
    const moved = sel !== null && sel !== this.sel;
    this.m = m;
    this.byId = new Map(m.ideas.map((d) => [d.id, d]));
    if (this.sel !== sel) this.hl = null;
    this.sel = sel;
    this.openEv = openEv;
    if (this.hl && ![...this.hl.ids].every((id) => this.byId.has(id))) this.hl = null;
    this.render();
    if (moved) this.flyTo([sel]);
  }

  /* ---------- time ---------- */
  private hrs(t: LT): number { return Math.max(0, this.m.cols.findIndex((c) => c.k === t[0])) * 24 + t[1]; }
  private get NOWH(): number { return this.hrs(this.m.now); }
  private fromH(h: number): LT { const i = clamp(Math.floor(h / 24), 0, this.m.cols.length - 1); return [(this.m.cols[i] as Col).k, Math.min(24, h - i * 24)]; }
  private T(): number { return this.ghostDraw || this.asOf === null ? this.NOWH : this.asOf; }
  private evOn = (e: LEv): boolean => this.hrs(e.t) <= this.T() + 1e-6;
  private visible(d: LIdea): LEv[] { return d.events.filter(this.evOn); }
  private born(d: LIdea): boolean { return this.hrs(d.start) <= this.T() + 1e-6; }
  private ideasNow(): LIdea[] { return this.m.ideas.filter((d) => this.born(d)); }
  private activeLinks(): LLink[] { return this.m.links.filter((l) => this.hrs(l.t) <= this.T() + 1e-6 && this.born(this.byId.get(l.to) as LIdea)); }
  private lastT(d: LIdea): LT { const ev = this.visible(d); return ev.length ? (ev.at(-1) as LEv).t : d.start; }
  private lastActT(d: LIdea): LT { let m = this.lastT(d); for (const l of this.activeLinks()) if (l.from === d.id && this.hrs(l.t) > this.hrs(m)) m = l.t; return m; }
  private ended(d: LIdea): boolean { return d.end !== null && this.hrs(d.end) <= this.T() + 1e-6; }
  private statusOf(d: LIdea): Status {
    if (this.asOf === null || this.ghostDraw || this.ended(d)) return d.status;
    if (this.visible(d).some((e) => e.type === 'parked')) return 'parked';
    return this.T() - this.hrs(this.lastActT(d)) <= 48 ? 'active' : 'dormant';
  }
  private isEnded(d: LIdea): boolean { return ENDED.includes(this.statusOf(d)); }
  private solidEndH(d: LIdea): number { return this.isEnded(d) && d.end ? this.hrs(d.end) : this.statusOf(d) === 'active' ? this.T() : this.hrs(this.lastActT(d)); }
  private tailEndH(d: LIdea): number { return this.isEnded(d) && d.end ? this.hrs(d.end) : this.T(); }
  private birthName(d: LIdea): string { return d.events[0]?.name ?? d.name; }
  private currentName(d: LIdea): string { let n = this.birthName(d); for (const e of this.visible(d)) if (e.name) n = e.name; return n; }
  /** Earlier names, oldest first, as of the current time. */
  private formerNames(d: LIdea): string[] {
    const all = [this.birthName(d)];
    for (const e of this.visible(d)) if (e.name && e.name !== all.at(-1)) all.push(e.name);
    const current = this.currentName(d);
    return [...new Set(all.slice(0, -1))].filter((n) => n !== current);
  }
  private daysSince(h: number): string { const n = Math.round((this.T() - h) / 24); return n < 1 ? 'today' : n === 1 ? '1 day' : `${n} days`; }
  private fmtH(h: number): string {
    const [k, hh] = this.fromH(h);
    const c = this.m.cols.find((x) => x.k === k) as Col;
    const at = new Date(c.start + (hh / 24) * (c.end - c.start));
    return at.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  private fam(d: LIdea): Fam { return this.m.fams[d.fam] as Fam; }
  private col(d: LIdea): string { return this.fam(d).color; }

  /* ---------- selection ---------- */
  private lineage(id: string): Set<string> {
    const set = new Set([id]);
    const L = this.activeLinks();
    for (const dir of ['up', 'down'] as const) {
      const q = [id];
      while (q.length) {
        const n = q.pop() as string;
        for (const l of L) {
          const o = dir === 'up' ? (l.to === n ? l.from : null) : (l.from === n ? l.to : null);
          if (o && !set.has(o)) { set.add(o); q.push(o); }
        }
      }
    }
    return set;
  }
  private neighborhood(id: string, depth: number): Set<string> {
    const set = new Set([id]);
    let front = [id];
    const L = this.activeLinks();
    for (let i = 0; i < depth; i++) {
      const nx: string[] = [];
      for (const n of front) for (const l of L) { const o = l.from === n ? l.to : l.to === n ? l.from : null; if (o && !set.has(o)) { set.add(o); nx.push(o); } }
      front = nx;
    }
    return set;
  }
  private shortestPath(a: string, b: string): Hl | null {
    const L = this.activeLinks();
    const prev = new Map<string, { n: string; l: LLink } | null>([[a, null]]);
    const q = [a];
    while (q.length) {
      const n = q.shift() as string;
      for (const l of L) {
        const o = l.from === n ? l.to : l.to === n ? l.from : null;
        if (!o || prev.has(o)) continue;
        prev.set(o, { n, l });
        if (o === b) {
          const ids = [b], links: LLink[] = [];
          let c = b;
          while (prev.get(c)) { const p = prev.get(c) as { n: string; l: LLink }; links.unshift(p.l); ids.unshift(p.n); c = p.n; }
          return { ids: new Set(ids), links: new Set(links), order: ids };
        }
        q.push(o);
      }
    }
    return null;
  }
  private selSet(): Set<string> | null {
    if (this.hl) return this.hl.ids;
    if (this.sel && this.byId.has(this.sel)) return this.view === 'constellation' ? this.neighborhood(this.sel, this.depth) : this.lineage(this.sel);
    return null;
  }
  private litLink(l: LLink): boolean { return !!this.hl && this.hl.links.has(l); }
  private linkOn(l: LLink): boolean {
    const S = this.selSet();
    if (!S) return true;
    if (this.hl && this.hl.links.size) return this.hl.links.has(l);
    return S.has(l.from) && S.has(l.to);
  }
  private ideaClick(ev: MouseEvent, id: string): void {
    ev.stopPropagation();
    if (ev.shiftKey && this.sel && this.sel !== id) {
      const p = this.shortestPath(this.sel, id);
      this.hl = p;
      this.render();
      if (p) this.flyTo(p.order);
      return;
    }
    this.hooks.select(id);
  }

  /* ---------- tooltip ---------- */
  private showTip(ev: MouseEvent, html: string): void { this.tip.innerHTML = html; this.tip.hidden = false; this.moveTip(ev); }
  private moveTip(ev: MouseEvent): void {
    const r = this.stage.getBoundingClientRect();
    let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    if (x + w > r.width - 8) x = ev.clientX - r.left - w - 14;
    if (y + h > r.height - 8) y = ev.clientY - r.top - h - 14;
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${Math.max(8, y)}px`;
  }
  private hideTip = (): void => { this.tip.hidden = true; };
  private evTip(d: LIdea, e: LEv): string {
    return `<div class="k">${esc(e.label)} · ${esc(this.fmtH(this.hrs(e.t)))}</div><div class="t">${esc(e.title)}</div>${e.quote ? `<q>${esc(e.quote)}</q><div class="src">— ${esc(saidBy(e.quoteBy).credit)}</div>` : ''}<div class="src">${esc(this.currentName(d))}</div>`;
  }
  private ideaTip(d: LIdea): string {
    const f = this.fam(d).name;
    const st = this.statusOf(d), age = this.daysSince(this.hrs(this.lastActT(d)));
    const when = st === 'parked' ? ` · parked ${age} ago` : st === 'dormant' ? ` · no updates in ${age}` : '';
    return `<div class="k">${f ? `${esc(f)} · ` : ''}${STATUSWORD[st]}${when}</div><div class="t">${esc(this.currentName(d))}</div><div>${esc(d.problem)}</div><div class="src">${this.visible(d).length} events · click to open · ⇧-click another to trace a path</div>`;
  }
  private linkTip(l: LLink): string {
    const a = this.byId.get(l.from) as LIdea, b = this.byId.get(l.to) as LIdea;
    return `<div class="k">${LINKWORD[l.type]}</div><div class="t">${esc(this.currentName(a))} → ${esc(this.currentName(b))}</div>`;
  }

  /* ---------- geometry ---------- */
  private W(): number { return this.stage.clientWidth; }
  /** Visible height: the stage grows with its lanes, so measure the scroll box around it. */
  private VH(): number { return Math.max(420, this.stage.parentElement?.clientHeight ?? 420); }
  private H(): number { return Math.max(this.VH(), R.TOP + this.m.ideas.length * R.LANE + 58); }
  private makeX(width: number, padL: number, padR: number): ((t: LT) => number) & { inv: (px: number) => number } {
    const cols = this.m.cols;
    const tw = cols.reduce((a, c) => a + c.w, 0) || 1, unit = Math.max(2, (width - padL - padR) / tw);
    const starts = new Map<string, number>();
    let acc = padL;
    for (const c of cols) { starts.set(c.k, acc); acc += c.w * unit; }
    const f = ((t: LT) => { const c = cols.find((x) => x.k === t[0]); return c ? (starts.get(t[0]) as number) + (t[1] / 24) * c.w * unit : padL; }) as ((t: LT) => number) & { inv: (px: number) => number };
    f.inv = (px) => {
      for (let i = cols.length - 1; i >= 0; i--) {
        const c = cols[i] as Col, s = starts.get(c.k) as number;
        if (px >= s) return i * 24 + clamp(((px - s) / (c.w * unit)) * 24, 0, 24);
      }
      return 0;
    };
    return f;
  }
  private riverGeom() {
    const W = this.W(), H = this.H(), base = this.makeX(W, R.PADL, R.PADR);
    const X = (t: LT): number => base(t) * this.rz.k + this.rz.x;
    return { W, H, base, X, Xh: (h: number) => X(this.fromH(h)), y: (d: LIdea) => R.TOP + d.lane * R.LANE + R.LANE / 2 };
  }

  private setHoverLane(id: string | null): void {
    if (this.hoverLane === id) return;
    this.hoverLane = id;
    this.schedule();
  }

  /* ---------- render ---------- */
  private schedule(): void { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); }); }
  render(): void {
    this.hideTip();
    if (this.m.cols.length === 0) return;
    if (this.view === 'river') this.renderRiver(); else this.renderConst();
    this.renderStrip();
  }

  private addGlow(defs: Sel): void {
    const f = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-200%').attr('width', '200%').attr('height', '500%');
    f.append('feGaussianBlur').attr('stdDeviation', 5);
  }

  private renderRiver(): void {
    const G = this.riverGeom(), { W, H, X, Xh } = G, svg = this.svg;
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove();
    this.addGlow(svg.append('defs'));
    const bands = svg.append('g');
    let labelEnd = -Infinity;
    const nowX = Xh(this.NOWH);
    this.m.cols.forEach((c, i) => {
      const x0 = X([c.k, 0]), x1 = X([c.k, 24]);
      if (x1 < 0 || x0 > W) return;
      const quiet = c.k.startsWith('q');
      if (i % 2 === 1 || quiet) bands.append('rect').attr('x', x0).attr('y', 0).attr('width', x1 - x0).attr('height', H).attr('style', `fill:var(--band);opacity:${quiet ? 0.9 : 0.55}`);
      bands.append('line').attr('x1', x0).attr('x2', x0).attr('y1', 36).attr('y2', H).attr('style', 'stroke:var(--rule);stroke-width:1');
      const cw = x1 - x0;
      // A label carrying a month always shows, even past its column; later day numbers give way to it.
      const monthLabel = /\D/.test(c.short);
      const lab = cw >= c.label.length * 7.4 + 14 ? c.label : (monthLabel || cw >= c.short.length * 7.6 + 10) ? c.short : '';
      const lx = monthLabel && cw < lab.length * 7.6 + 10 ? Math.max(x0 + 4, 8) : clamp(x0 + 6, 8, Math.max(8, x1 - lab.length * 7.6 - 4));
      if (lab && lx > labelEnd + 8 && (lx + lab.length * 7.6 < nowX - 18 || lx > nowX + 30)) {
        bands.append('text').attr('class', 'day').attr('x', lx).attr('y', 26).text(lab).append('title').text(c.label);
        labelEnd = lx + lab.length * 7.6;
      }
      const pph = cw / 24, step = pph > 46 ? 1 : pph > 16 ? 3 : pph > 6 ? 6 : 0;
      if (step && !quiet) for (let h = step; h < 24; h += step) {
        const xx = x0 + h * pph;
        if (xx < -30 || xx > W) continue;
        bands.append('line').attr('x1', xx).attr('x2', xx).attr('y1', 52).attr('y2', H).attr('style', 'stroke:var(--rule);stroke-width:1;stroke-dasharray:1 6');
        bands.append('text').attr('class', 'hr').attr('x', xx + 3).attr('y', 46).text(`${String(h).padStart(2, '0')}:00`);
      }
    });
    const nx = Xh(this.NOWH);
    bands.append('line').attr('x1', nx).attr('x2', nx).attr('y1', 34).attr('y2', H - 8).attr('style', 'stroke:var(--faint);stroke-width:1;stroke-dasharray:2 4');
    bands.append('text').attr('class', 'day').attr('x', nx).attr('y', 26).attr('text-anchor', 'middle').attr('style', 'fill:var(--ink)').text('now');
    if (this.asOf !== null && this.ghost) {
      this.ghostDraw = true;
      this.drawRiverLayer(svg.append('g').attr('opacity', 0.16).style('pointer-events', 'none'), G, true);
      this.ghostDraw = false;
    }
    this.drawRiverLayer(svg.append('g'), G, false);
    if (this.asOf !== null) {
      const sx = Xh(this.asOf), g = svg.append('g').style('pointer-events', 'none');
      g.append('line').attr('x1', sx).attr('x2', sx).attr('y1', 34).attr('y2', H - 6).attr('style', 'stroke:var(--scrub);stroke-width:1.6');
      g.append('text').attr('class', 'scrub-lbl').attr('x', sx + 6).attr('y', H - 10).text(this.fmtH(this.asOf));
    }
    svg.on('click', () => this.clearFocus());
  }

  private drawRiverLayer(root: Sel, G: ReturnType<Lens['riverGeom']>, ghost: boolean): void {
    const { W, X, Xh, y } = G, S = ghost ? null : this.selSet(), defs = this.svg.select('defs');
    const lg = root.append('g');
    this.activeLinks().forEach((l, i) => {
      const a = this.byId.get(l.from) as LIdea, b = this.byId.get(l.to) as LIdea;
      const x1 = X(l.t), y1 = y(a), x2 = X(b.start), y2 = y(b), dx = Math.max(22, (x2 - x1) * 0.55);
      const gid = `${ghost ? 'gl' : 'lg'}${i}`;
      const grad = defs.append('linearGradient').attr('id', gid).attr('gradientUnits', 'userSpaceOnUse').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      grad.append('stop').attr('offset', '0').attr('style', `stop-color:${this.col(a)}`);
      grad.append('stop').attr('offset', '1').attr('style', `stop-color:${this.col(b)}`);
      const lit = !ghost && this.litLink(l), g = lg.append('g').attr('class', `g-link${S && !this.linkOn(l) ? ' dim' : ''}`);
      const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      if (lit) g.append('path').attr('d', d).attr('class', 'lane-line glow').attr('filter', 'url(#glow)').attr('style', `stroke:url(#${gid});stroke-width:9`);
      g.append('path').attr('d', d).attr('class', 'lane-line').attr('style', `stroke:url(#${gid});stroke-width:${lit ? 3.6 : l.type === 'merge' ? 3 : 2};${l.suggested && !lit ? 'stroke-dasharray:5 5;opacity:.75' : ''}`);
      if (lit) g.append('path').attr('d', d).attr('class', 'lane-line lit').attr('style', 'stroke:var(--surface);stroke-width:2;stroke-dasharray:2 12;opacity:.9');
      if (!ghost) g.append('path').attr('d', d).attr('class', 'lane-hit').on('mousemove', (ev: MouseEvent) => this.showTip(ev, this.linkTip(l))).on('mouseleave', this.hideTip);
    });

    for (const d of this.ideasNow()) {
      const col = this.col(d), yy = y(d), st = this.statusOf(d), dim = S && !S.has(d.id);
      const g = root.append('g').attr('class', `g-idea${dim ? ' dim' : ''}`);
      const x0 = X(d.start), se = Xh(this.solidEndH(d)), te = Xh(this.tailEndH(d)), fin = this.isEnded(d);
      if (st === 'active' && !ghost) g.append('path').attr('class', 'lane-line glow').attr('filter', 'url(#glow)').attr('d', `M${x0},${yy}H${se}`).attr('style', `stroke:${col};stroke-width:9`);
      g.append('path').attr('class', 'lane-line').attr('d', `M${x0},${yy}H${se}`).attr('style', `stroke:${col};stroke-width:3.2`);
      if (st === 'dormant' || st === 'parked') {
        g.append('path').attr('class', 'lane-line').attr('d', `M${se + 9},${yy}H${te}`).attr('style', `stroke:${col};stroke-width:2;stroke-dasharray:1 6;opacity:.7`);
      }
      if (ghost) {
        for (const e of this.visible(d)) { const xx = X(e.t); if (xx > -20 && xx < W + 20) glyph(g.append('g').attr('transform', `translate(${xx},${yy})`), e.type, col, e.suggested); }
        continue;
      }
      g.append('path').attr('class', 'lane-hit').attr('d', `M${x0},${yy}H${fin ? se : te}`)
        .on('mouseenter', () => this.setHoverLane(d.id))
        .on('mousemove', (ev: MouseEvent) => this.showTip(ev, this.ideaTip(d))).on('mouseleave', () => { this.hideTip(); this.setHoverLane(null); })
        .on('click', (ev: MouseEvent) => this.ideaClick(ev, d.id)).on('dblclick', (ev: MouseEvent) => { ev.stopPropagation(); this.flyTo([d.id]); });
      if (st === 'active') {
        const p = g.append('g').attr('transform', `translate(${te},${yy})`);
        p.append('circle').attr('class', 'ring').attr('r', 6).attr('style', `stroke:${col}`);
        p.append('circle').attr('r', 5).attr('style', `fill:${col};stroke:var(--surface);stroke-width:2`);
      }
      // The name sits a little above its line and starts flush with the first node's left edge.
      const cn = this.currentName(d), former = this.formerNames(d), lx = Math.max(x0 - 7, 8);
      if (te > lx + 30 || x0 > 0) {
        const sl = g.append('text').attr('class', 'lbl').attr('x', lx).attr('y', yy - 16).style('cursor', 'pointer').on('click', (ev: MouseEvent) => this.ideaClick(ev, d.id));
        sl.append('tspan').text(cn);
        if (former.length) sl.append('tspan').attr('class', 'was').text(`  formerly ${former.join(' → ')}`);
      }
      const endWord = st === 'dropped' && d.resolution && d.resolution !== 'other' ? `dropped · ${RESOLUTION_WORD[d.resolution]}` : STATUSWORD[st];
      if (st !== 'merged') g.append('text').attr('class', 'lbl-end').attr('x', fin ? se + 14 : te + (st === 'active' ? 18 : 12)).attr('y', yy + 4).text(endWord);
      const evs = this.visible(d), endX = fin ? se : te;
      evs.forEach((e, i) => {
        const xx = X(e.t);
        if (xx < -40 || xx > W + 40) return;
        const eg = g.append('g').attr('transform', `translate(${xx},${yy})`);
        const fresh = this.asOf !== null && Math.abs(this.hrs(e.t) - this.asOf) < 1e-6;
        const inner = eg.append('g');
        if (fresh) inner.attr('class', 'arrive');
        glyph(inner, e.type, col, e.suggested);
        if (fresh) eg.append('circle').attr('class', 'ring').attr('r', 8).attr('style', `stroke:${col}`);
        if (this.openEv === e.uid) eg.insert('circle', ':first-child').attr('r', 13).attr('style', `fill:color-mix(in srgb,${col} 18%,transparent);stroke:var(--ink);stroke-width:1.8`);
        eg.append('circle').attr('class', 'hit').attr('r', 11)
          .on('mouseenter', () => this.setHoverLane(d.id))
          .on('mousemove', (ev: MouseEvent) => this.showTip(ev, this.evTip(d, e))).on('mouseleave', () => { this.hideTip(); this.setHoverLane(null); })
          .on('click', (ev: MouseEvent) => { if (ev.shiftKey) return this.ideaClick(ev, d.id); ev.stopPropagation(); this.hooks.openEvent(d.id, e.uid); })
          .on('dblclick', (ev: MouseEvent) => { ev.stopPropagation(); this.flyTo([d.id]); });
        if (this.rz.k >= 1.5 && (this.hoverLane === d.id || (S?.has(d.id) ?? false))) {
          const nxt = i < evs.length - 1 ? X((evs[i + 1] as LEv).t) : Math.max(endX, xx + 140), avail = nxt - xx - 12;
          if (avail >= 46) {
            const fit = (s: string, px: number): string => { const n = Math.floor(px / 5.7); return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s; };
            g.append('text').attr('class', 'ev-t').attr('x', xx - 4).attr('y', yy + 18).text(fit(e.title, avail));
            if (this.rz.k >= 6 && avail >= 130 && e.quote) g.append('text').attr('class', 'ev-q').attr('x', xx - 4).attr('y', yy + 30).text(`“${fit(e.quote, avail - 10)}”`);
          }
        }
      });
    }
    if (ghost) return;
    d3.group(this.activeLinks().filter((l) => l.type === 'merge'), (l) => l.to).forEach((ls, to) => {
      const dim = S && !ls.every((l) => S.has(l.from) && S.has(l.to));
      const g = root.append('g').attr('class', `g-link${dim ? ' dim' : ''}`);
      const ys = ls.map((l) => y(this.byId.get(l.from) as LIdea)).sort((a, b) => a - b);
      card(g, X((ls[0] as LLink).t) + 14, ys[Math.floor((ys.length - 1) / 2)] as number, [[`${ls.length} → 1  `, 'k'], [`merged into ${this.birthName(this.byId.get(to) as LIdea)}`]], 'merge', 'start');
    });
  }

  /* ---------- constellation ---------- */
  /** Node size grows with activity; ideas with a logo get a floor so the logo stays readable. */
  private rad(d: LIdea): number { return (d.logo ? 13 : 9) + Math.min(8, d.events.length) * (d.logo ? 1.1 : 1.5); }
  private constLayout(W: number, H: number): void {
    if (this.m.ideas.every((d) => this.pos[d.id])) return;
    const famKeys = [...new Set(this.m.ideas.map((d) => d.fam))];
    const cols = Math.max(1, Math.ceil(Math.sqrt((famKeys.length * W) / Math.max(1, H))));
    const rows = Math.ceil(famKeys.length / cols);
    const center = (f: string): { x: number; y: number } => {
      const i = famKeys.indexOf(f);
      return { x: W * (0.12 + (0.7 * ((i % cols) + 0.5)) / cols), y: H * (0.14 + (0.72 * (Math.floor(i / cols) + 0.5)) / rows) };
    };
    type N = d3.SimulationNodeDatum & { id: string; d: LIdea; r: number };
    const nodes: N[] = this.m.ideas.map((d) => ({ id: d.id, d, r: this.rad(d), x: center(d.fam).x + (rnd(d.id) - 0.5) * 90, y: center(d.fam).y + (rnd(`${d.id}y`) - 0.5) * 90 }));
    const nm = new Map(nodes.map((n) => [n.id, n]));
    const links = this.m.links.map((l) => ({ source: nm.get(l.from) as N, target: nm.get(l.to) as N, l }));
    let seed = 7;
    const lcg = (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const sim = d3.forceSimulation(nodes).randomSource(lcg)
      .force('link', d3.forceLink(links).distance((k) => (k.l.type === 'merge' ? 100 : 135)).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('x', d3.forceX<N>((n) => center(n.d.fam).x).strength(0.24))
      .force('y', d3.forceY<N>((n) => center(n.d.fam).y).strength(0.18))
      .force('collide', d3.forceCollide<N>((n) => n.r + 54)).stop();
    for (let i = 0; i < 450; i++) {
      sim.tick();
      for (const n of nodes) { n.x = clamp(n.x ?? 0, 150, W - 200); n.y = clamp(n.y ?? 0, 70, H - 50); }
    }
    for (const n of nodes) if (!this.pos[n.id]) this.pos[n.id] = { x: (n.x ?? 0) / W, y: (n.y ?? 0) / H };
    this.savePos();
  }
  private savePos(): void { try { localStorage.setItem(POS_KEY, JSON.stringify(this.pos)); } catch { /* storage refused */ } }

  private renderConst(): void {
    const W = this.W(), H = this.VH(), svg = this.svg;
    this.constLayout(W, H);
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove();
    const defs = svg.append('defs');
    this.addGlow(defs);
    const root = svg.append('g').attr('transform', this.cz.toString());
    const P = (id: string): { x: number; y: number } => { const p = this.pos[id] ?? { x: 0.5, y: 0.5 }; return { x: p.x * W, y: p.y * H }; };
    const S = this.selSet(), k = this.cz.k;
    const famNames = new Map<string, LIdea[]>();
    for (const d of this.ideasNow()) famNames.set(d.fam, [...(famNames.get(d.fam) ?? []), d]);
    famNames.forEach((ns, f) => {
      const name = this.m.fams[f]?.name;
      if (!name || ns.length < 2) return;
      root.append('text').attr('class', 'day').attr('text-anchor', 'middle').attr('x', d3.mean(ns, (d) => P(d.id).x) ?? 0).attr('y', Math.min(...ns.map((d) => P(d.id).y)) - 46).text(name);
    });
    const lg = root.append('g'), ng = root.append('g'), lblg = root.append('g');
    this.activeLinks().forEach((l, i) => {
      const a = P(l.from), b = P(l.to), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, off = len * 0.12;
      const cx = mx - (dy / len) * off, cy = my + (dx / len) * off, d = `M${a.x},${a.y}Q${cx},${cy} ${b.x},${b.y}`;
      const gid = `cg${i}`, gr = defs.append('linearGradient').attr('id', gid).attr('gradientUnits', 'userSpaceOnUse').attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y);
      gr.append('stop').attr('offset', 0).attr('style', `stop-color:${this.col(this.byId.get(l.from) as LIdea)}`);
      gr.append('stop').attr('offset', 1).attr('style', `stop-color:${this.col(this.byId.get(l.to) as LIdea)}`);
      const lit = this.litLink(l), g = lg.append('g').attr('class', `g-link${S && !this.linkOn(l) ? ' dim' : ''}`);
      if (lit) g.append('path').attr('d', d).attr('class', 'lane-line glow').attr('filter', 'url(#glow)').attr('style', `stroke:url(#${gid});stroke-width:9`);
      g.append('path').attr('d', d).attr('class', 'lane-line').attr('style', `stroke:url(#${gid});stroke-width:${lit ? 3.4 : l.type === 'merge' ? 2.4 : 1.6};${l.suggested && !lit ? 'stroke-dasharray:5 5;opacity:.8' : ''}`);
      if (lit) g.append('path').attr('d', d).attr('class', 'lane-line lit').attr('style', 'stroke:var(--surface);stroke-width:2;stroke-dasharray:2 12;opacity:.9');
      g.append('path').attr('d', d).attr('class', 'lane-hit').on('mousemove', (ev: MouseEvent) => this.showTip(ev, this.linkTip(l))).on('mouseleave', this.hideTip);
      if (lit || k >= 1.8 || (this.sel && (l.from === this.sel || l.to === this.sel) && !this.hl)) {
        g.append('text').attr('class', 'link-lbl').attr('text-anchor', 'middle').attr('x', 0.25 * a.x + 0.5 * cx + 0.25 * b.x).attr('y', 0.25 * a.y + 0.5 * cy + 0.25 * b.y - 5).text(LINKWORD[l.type] + (l.suggested ? '?' : ''));
      }
    });
    const nodes = this.ideasNow();
    for (const d of nodes) {
      const p = P(d.id), col = this.col(d), s = this.statusOf(d), r = this.rad(d), dim = S && !S.has(d.id);
      const g = ng.append('g').attr('class', `cnode${dim ? ' dim' : ''}`).attr('transform', `translate(${p.x},${p.y})`).style('cursor', 'pointer');
      if (s === 'active') g.append('circle').attr('class', 'ring').attr('r', r).attr('style', `stroke:${col}`);
      if (this.sel === d.id || this.hl?.ids.has(d.id)) g.append('circle').attr('r', r + 6).attr('style', `fill:none;stroke:${col};stroke-width:1.5;opacity:.6`);
      const hollow = ['merged', 'pivoted', 'dropped', 'parked', 'released'].includes(s);
      if (d.logo) {
        // The logo fills the node; a thin ring outside it carries status (dashed when parked, faded when ended).
        g.append('circle').attr('r', r + 2.5).attr('style', `fill:var(--surface);stroke:${col};stroke-width:2;${s === 'parked' ? 'stroke-dasharray:3 3;' : ''}${hollow || s === 'dormant' ? 'opacity:.75' : ''}`);
      } else g.append('circle').attr('r', r).attr('style', hollow ? `fill:var(--surface);stroke:${col};stroke-width:2.4;${s === 'parked' ? 'stroke-dasharray:3 3' : ''}` : `fill:${col};stroke:var(--surface);stroke-width:2.5;${s === 'dormant' ? 'opacity:.55' : ''}`);
      this.drawFace(g, d, r, defs);
      g.on('mousemove', (ev: MouseEvent) => this.showTip(ev, this.ideaTip(d))).on('mouseleave', this.hideTip)
        .on('click', (ev: MouseEvent) => this.ideaClick(ev, d.id)).on('dblclick', (ev: MouseEvent) => { ev.stopPropagation(); this.flyTo([d.id]); });
      g.call(d3.drag<SVGGElement, unknown>().on('start', this.hideTip).on('drag', (ev) => { this.pos[d.id] = { x: clamp(ev.x, 20, W - 20) / W, y: clamp(ev.y, 20, H - 20) / H }; this.schedule(); }).on('end', () => this.savePos()) as any);
    }
    const boxes = nodes.map((d) => { const p = P(d.id), r = this.rad(d); return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r, own: d.id }; });
    const prio = (d: LIdea): number => (this.sel === d.id ? 0 : this.hl?.ids.has(d.id) ? 1 : this.statusOf(d) === 'active' ? 2 : 3);
    for (const d of [...nodes].sort((a, b) => prio(a) - prio(b))) {
      if (k < 0.7 && prio(d) >= 2) continue;
      const dim = S && !S.has(d.id);
      if (dim && k < 1.2) continue;
      const p = P(d.id), r = this.rad(d), name = this.currentName(d), w = name.length * 6.9 + 4, h = 15;
      const cand = [
        { x: p.x + r + 6, y: p.y + 4, a: 'start', bx: p.x + r + 4, by: p.y - 9 },
        { x: p.x - r - 6, y: p.y + 4, a: 'end', bx: p.x - r - 6 - w, by: p.y - 9 },
        { x: p.x, y: p.y + r + 15, a: 'middle', bx: p.x - w / 2, by: p.y + r + 3 },
        { x: p.x, y: p.y - r - 7, a: 'middle', bx: p.x - w / 2, by: p.y - r - 7 - h + 3 },
      ];
      const outside = (c: (typeof cand)[number]): boolean => {
        const [sx0] = this.cz.apply([c.bx, 0]), [sx1] = this.cz.apply([c.bx + w, 0]);
        return sx0 < 4 || sx1 > W - 4;
      };
      const hit = (c: (typeof cand)[number]): boolean => outside(c) || boxes.some((b) => b.own !== d.id && !(c.bx + w < b.x0 || c.bx > b.x1 || c.by + h < b.y0 || c.by > b.y1));
      const c = cand.find((x) => !hit(x)) ?? (cand[0] as (typeof cand)[number]);
      boxes.push({ x0: c.bx, y0: c.by, x1: c.bx + w, y1: c.by + h, own: `${d.id}L` });
      lblg.append('text').attr('class', `lbl${dim ? ' dim' : ''}`).attr('x', c.x).attr('y', c.y).attr('text-anchor', c.a).text(name).style('cursor', 'pointer').on('click', (ev: MouseEvent) => this.ideaClick(ev, d.id));
      if (this.sel === d.id || k >= 1.5) lblg.append('text').attr('class', `lbl-end${dim ? ' dim' : ''}`).attr('x', c.x).attr('y', c.y + 13).attr('text-anchor', c.a).text(STATUSWORD[this.statusOf(d)]);
    }
    svg.on('click', () => this.clearFocus());
  }

  /** The idea's logo clipped to its node; without one the node stays a plain disc. */
  private drawFace(g: Sel, d: LIdea, r: number, defs: Sel): void {
    if (!d.logo) return;
    const side = r * 2, clip = `face-${d.id}`;
    if (defs.select(`#${clip}`).empty()) defs.append('clipPath').attr('id', clip).append('circle').attr('r', r);
    g.append('image').attr('href', d.logo).attr('x', -side / 2).attr('y', -side / 2).attr('width', side).attr('height', side)
      .attr('clip-path', `url(#${clip})`).attr('preserveAspectRatio', 'xMidYMid slice').style('pointer-events', 'none');
  }

  private clearFocus(): void {
    if (this.hl) { this.hl = null; this.render(); return; }
    if (this.sel) this.hooks.select(null);
  }

  /* ---------- zoom ---------- */
  private curZoom(): d3.ZoomBehavior<SVGSVGElement, unknown> { return this.view === 'river' ? this.zoomR : this.zoomC; }
  private bindZoom(): void {
    this.svg.on('.zoom', null);
    this.svg.call(this.curZoom() as any);
    (this.svgEl as any).__zoom = this.view === 'river' ? this.rz : this.cz;
    this.svg.on('dblclick.zoom', null);
  }
  zoomBy(f: number): void { this.svg.transition().duration(dur(350)).call(this.curZoom().scaleBy as any, f); }
  fit(): void { this.svg.transition().duration(dur(500)).call(this.curZoom().transform as any, d3.zoomIdentity); }
  flyTo(ids: (string | null)[]): void {
    const list = ids.filter((id): id is string => id !== null && this.byId.has(id) && this.born(this.byId.get(id) as LIdea));
    if (!list.length || this.morphing) return;
    const W = this.W(), H = this.VH();
    if (this.view === 'river') {
      const base = this.makeX(W, R.PADL, R.PADR);
      let lo = Infinity, hi = -Infinity;
      for (const id of list) { const d = this.byId.get(id) as LIdea; lo = Math.min(lo, base(d.start)); hi = Math.max(hi, base(this.fromH(this.tailEndH(d)))); }
      const k = clamp((W - R.PADR - 80) / Math.max(40, hi - lo), 1, 60), x = clamp(W * 0.42 - ((lo + hi) / 2) * k, W - W * k, 0);
      this.svg.transition().duration(dur(800)).call(this.zoomR.transform as any, d3.zoomIdentity.translate(x, 0).scale(k));
      const top = Math.min(...list.map((id) => R.TOP + (this.byId.get(id) as LIdea).lane * R.LANE));
      const box = this.stage.parentElement;
      if (box && (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 80)) box.scrollTo({ top: Math.max(0, top - 80), behavior: reduceMotion() ? 'auto' : 'smooth' });
    } else {
      this.constLayout(W, H);
      const xs = list.map((id) => (this.pos[id]?.x ?? 0.5) * W), ys = list.map((id) => (this.pos[id]?.y ?? 0.5) * H);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const k = clamp(Math.min((W - 320) / Math.max(140, x1 - x0), (H - 160) / Math.max(140, y1 - y0)), 0.6, 2.2);
      this.svg.transition().duration(dur(800)).call(this.zoomC.transform as any, d3.zoomIdentity.translate(W / 2 - 40 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k));
    }
  }

  /* ---------- time strip ---------- */
  private renderStrip(): void {
    const W = this.W(), H = 60, top = 18, bot = H - 8, sx = this.makeX(W, R.PADL, R.PADR), strip = this.strip;
    strip.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove();
    const sxh = (h: number): number => sx(this.fromH(h));
    this.stripX = sx;
    strip.append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', H).attr('fill', 'transparent');
    for (const c of this.m.cols) {
      const x0 = sx([c.k, 0]);
      strip.append('line').attr('x1', x0).attr('x2', x0).attr('y1', 4).attr('y2', H - 4).attr('style', 'stroke:var(--rule)');
      const w = sx([c.k, 24]) - x0;
      if (c.short && (w > 30 || /\D/.test(c.short))) strip.append('text').attr('class', 'hr').attr('x', x0 + 4).attr('y', 12).text(c.short);
    }
    const rowH = (bot - top) / Math.max(1, this.m.ideas.length);
    this.ghostDraw = true;
    const full = this.m.ideas.map((d) => ({ d, a: this.hrs(d.start), b: this.tailEndH(d) }));
    this.ghostDraw = false;
    for (const { d, a, b } of full) {
      const yy = top + d.lane * rowH + rowH / 2;
      strip.append('line').attr('x1', sxh(a)).attr('x2', sxh(b)).attr('y1', yy).attr('y2', yy).attr('style', `stroke:${this.col(d)};stroke-width:2;opacity:.22;stroke-linecap:round`).style('pointer-events', 'none');
      if (this.born(d)) strip.append('line').attr('x1', sxh(a)).attr('x2', sxh(Math.min(b, this.tailEndH(d)))).attr('y1', yy).attr('y2', yy).attr('style', `stroke:${this.col(d)};stroke-width:2;opacity:.9;stroke-linecap:round`).style('pointer-events', 'none');
    }
    if (this.view === 'river' && this.rz.k > 1.01) {
      const bx0 = -this.rz.x / this.rz.k, bx1 = (W - this.rz.x) / this.rz.k;
      strip.append('rect').attr('class', 'win').attr('x', bx0).attr('y', top - 4).attr('width', bx1 - bx0).attr('height', bot - top + 8).attr('rx', 5)
        .style('pointer-events', 'none');
    }
    const hx = sxh(this.T()), g = strip.append('g').attr('class', 'handle').attr('transform', `translate(${hx},0)`);
    g.append('line').attr('y1', 3).attr('y2', H - 3).attr('style', 'stroke:var(--scrub);stroke-width:2');
    g.append('circle').attr('cy', H / 2).attr('r', 7.5).attr('style', 'fill:var(--scrub);stroke:var(--surface);stroke-width:2.5');
    g.append('rect').attr('x', -14).attr('y', 0).attr('width', 28).attr('height', H).attr('fill', 'transparent');
    const lbl = this.asOf === null ? 'now' : this.fmtH(this.asOf);
    strip.append('text').attr('class', 'scrub-lbl').attr('x', hx + (hx > W - 160 ? -12 : 12)).attr('y', H / 2 + 3.5).attr('text-anchor', hx > W - 160 ? 'end' : 'start').text(lbl).style('pointer-events', 'none');
  }

  /** Move the playhead to strip position `px`, and pan the River so the playhead stays in view. */
  private scrubTo(px: number): void {
    if (!this.stripX) return;
    if (this.replayTimer !== null) this.stopReplay(true);
    this.scrubbing = true;
    this.setAsOf(this.stripX.inv(px), this.stripX);
    this.scrubbing = false;
    if (this.view !== 'river' || this.rz.k <= 1.01) return;
    const W = this.W(), x = this.stripX(this.fromH(this.T())) * this.rz.k + this.rz.x;
    if (x > W * 0.15 && x < W * 0.8) return;
    const tx = clamp(W * (x <= W * 0.15 ? 0.2 : 0.75) - (x - this.rz.x), W - W * this.rz.k, 0);
    this.svg.call(this.zoomR.transform as any, d3.zoomIdentity.translate(tx, 0).scale(this.rz.k));
  }

  /** True while a scrub, not the replay, moved the playhead. */
  scrubbing = false;
  get replaying(): boolean { return this.replayTimer !== null; }

  /** The key moments up to the playhead (all of them at now), as the replay would have captioned them. */
  momentsUntil(): Caption[] {
    const beats = this.beats(), end = this.T(), keep = this.asOf, out: Caption[] = [];
    for (const [i, b] of beats.entries()) {
      if (b.h > end + 1e-6) break;
      if (!b.key) continue;
      this.asOf = b.h;
      out.push(this.caption(b, i, beats.length));
    }
    this.asOf = keep;
    return out;
  }

  private caption(b: { h: number; d: LIdea; e: LEv }, i: number, total: number): Caption {
    return {
      when: this.fmtH(b.h), what: b.e.label, idea: this.currentName(b.d), ideaId: b.d.id, logo: b.d.logo,
      detail: b.e.title === b.e.label ? '' : b.e.title, quote: b.e.quote, quoteBy: b.e.quoteBy, color: this.col(b.d), step: i + 1, total,
      weight: KEY_MOMENTS.get(b.e.label) ?? 1,
    };
  }
  private evHours(): number[] { return [...new Set(this.m.ideas.flatMap((d) => d.events.map((e) => this.hrs(e.t))))].sort((a, b) => a - b); }
  private setAsOf(h: number, sx?: (t: LT) => number): void {
    const hs = this.evHours();
    if (!hs.length) return;
    if (sx) { const px = sx(this.fromH(h)); const near = hs.find((e) => Math.abs(sx(this.fromH(e)) - px) < 7); if (near !== undefined) h = near; }
    h = clamp(h, hs[0] as number, this.NOWH);
    this.asOf = h >= this.NOWH - 0.02 ? null : h;
    if (this.asOf === null) this.ghost = false;
    this.onAsOf(this.asOf === null ? null : this.fmtH(this.asOf));
    this.render();
  }
  backToNow(): void { this.stopReplay(false); }

  /* ---------- cinematic replay ---------- */
  /**
   * A replay is a list of beats in time order. Minor events tick past; key moments slow the playhead, move the
   * camera to them, light their family, and hold a caption. Pausing, skipping and stopping work at any point.
   */
  replay(): void {
    if (this.replayTimer !== null) { this.stopReplay(false); return; }
    const beats = this.beats();
    if (!beats.length) return;
    const run = ++this.runId;
    this.replayTimer = run;
    this.paused = false;
    this.onReplay(true);
    void this.play(beats, run);
  }
  pauseReplay(): void { this.paused = !this.paused; this.onPaused(this.paused); this.wake?.(); }
  nextMoment(): void { this.skip = true; this.wake?.(); }

  private beats(): { h: number; d: LIdea; e: LEv; key: boolean }[] {
    const out: { h: number; d: LIdea; e: LEv; key: boolean }[] = [];
    // With an idea open, Replay tells its story: the idea and its lineage. Otherwise, the whole board.
    const only = this.sel && this.byId.has(this.sel) ? this.lineage(this.sel) : null;
    for (const d of this.m.ideas) {
      if (only && !only.has(d.id)) continue;
      for (const e of d.events) out.push({ h: this.hrs(e.t), d, e, key: KEY_MOMENTS.has(e.label) });
    }
    return out.sort((x, y) => x.h - y.h || Number(y.key) - Number(x.key));
  }

  /** Wait `ms`, holding while paused; resolves early on skip or stop. */
  private wait(ms: number, run: number): Promise<void> {
    return new Promise((resolve) => {
      const end = performance.now() + ms;
      const tick = (): void => {
        if (run !== this.runId || this.skip) return resolve();
        if (this.paused) { this.wake = tick; return; }
        const left = end - performance.now();
        if (left <= 0) return resolve();
        setTimeout(tick, Math.min(left, 120));
      };
      tick();
    });
  }

  /** Slide the playhead from where it is to `h`, rendering as it goes. */
  private async glide(h: number, ms: number, run: number): Promise<void> {
    const from = this.asOf ?? h, t0 = performance.now();
    if (ms <= 0 || reduceMotion()) { this.setPlayhead(h); return; }
    while (run === this.runId && !this.skip) {
      if (this.paused) { await this.wait(200, run); continue; }
      const k = Math.min(1, (performance.now() - t0) / ms), eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.setPlayhead(from + (h - from) * eased);
      if (k >= 1) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
    this.setPlayhead(h);
  }

  private setPlayhead(h: number): void {
    this.asOf = h;
    this.onAsOf(this.fmtH(h));
    this.render();
  }

  private async play(beats: { h: number; d: LIdea; e: LEv; key: boolean }[], run: number): Promise<void> {
    this.setPlayhead(beats[0]?.h ?? 0);
    for (const [i, b] of beats.entries()) {
      if (run !== this.runId) return;
      const fast = this.skip && !b.key;
      if (b.key) this.skip = false;
      if (!b.key) {
        await this.glide(b.h, fast ? 0 : 260, run);
        continue;
      }
      this.skip = false;
      await this.glide(b.h, 900, run);
      if (run !== this.runId) return;
      this.hl = { ids: this.lineage(b.d.id), links: new Set(), order: [b.d.id] };
      this.focusCamera(b.d, b.h);
      this.render();
      const c = this.caption(b, i, beats.length), weight = c.weight;
      this.onCaption(c);
      // Bigger moments hold longer, so the feed breathes with the story.
      await this.wait(1400 + weight * 600 + (b.e.quote ? 900 : 0), run);
      this.hl = null;
      this.skip = false;
    }
    if (run === this.runId) { await this.wait(800, run); this.stopReplay(false); }
  }

  /** Keep the moment in view: the River centres a few days around it; the Constellation flies to the idea. */
  private focusCamera(d: LIdea, h: number): void {
    if (this.view === 'constellation') { this.flyTo([d.id]); return; }
    const W = this.W(), base = this.makeX(W, R.PADL, R.PADR);
    const x = base(this.fromH(h)), window = Math.max(120, base(this.fromH(h + 72)) - base(this.fromH(h - 72)));
    const k = clamp((W * 0.55) / window, 1, 12), tx = clamp(W * 0.45 - x * k, W - W * k, 0);
    this.svg.transition().duration(dur(1100)).ease(d3.easeCubicInOut).call(this.zoomR.transform as any, d3.zoomIdentity.translate(tx, 0).scale(k));
    const box = this.stage.parentElement, top = R.TOP + d.lane * R.LANE;
    if (box && (top < box.scrollTop + 40 || top > box.scrollTop + box.clientHeight - 120)) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  private stopReplay(keep: boolean): void {
    if (this.replayTimer !== null) {
      this.runId++;
      this.replayTimer = null;
      this.paused = false;
      this.hl = null;
      this.onCaption(null);
      this.onReplay(false);
      this.wake?.();
    }
    if (!keep) { this.asOf = null; this.ghost = false; this.onAsOf(null); this.fit(); this.render(); }
  }

  /* ---------- staged morph between views ---------- */
  private geomRects(view: View): Record<string, { x: number; y: number; w: number; h: number; rx: number }> {
    const o: Record<string, { x: number; y: number; w: number; h: number; rx: number }> = {};
    if (view === 'river') {
      const G = this.riverGeom();
      for (const d of this.ideasNow()) { const x1 = G.X(d.start), x2 = Math.max(x1 + 6, G.Xh(this.tailEndH(d))), yy = G.y(d); o[d.id] = { x: x1, y: yy - 1.8, w: x2 - x1, h: 3.6, rx: 1.8 }; }
      return o;
    }
    const W = this.W(), H = this.VH();
    this.constLayout(W, H);
    for (const d of this.ideasNow()) {
      const p = this.cz.apply([(this.pos[d.id]?.x ?? 0.5) * W, (this.pos[d.id]?.y ?? 0.5) * H]), r = this.rad(d) * this.cz.k;
      o[d.id] = { x: p[0] - r, y: p[1] - r, w: 2 * r, h: 2 * r, rx: r };
    }
    return o;
  }
  setView(v: View): void {
    if (v === this.view || this.morphing) return;
    this.hideTip();
    const finish = (): void => { this.view = v; this.bindZoom(); this.render(); };
    if (reduceMotion()) { finish(); return; }
    const a = this.geomRects(this.view), b = this.geomRects(v), W = this.W(), H = this.H(), toRiver = v === 'river';
    this.morphing = true;
    const ov = d3.select(this.stage).append('svg').attr('class', 'morph').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    this.svgEl.classList.add('out');
    const ids = Object.keys(a).filter((id) => b[id]);
    type Box = { x: number; y: number; w: number; h: number; rx: number };
    const set = (sel: any, g: (id: string) => Box): any => sel.attr('x', (id: string) => g(id).x).attr('y', (id: string) => g(id).y).attr('width', (id: string) => g(id).w).attr('height', (id: string) => g(id).h).attr('rx', (id: string) => g(id).rx);
    const rs = set(ov.selectAll('rect').data(ids).join('rect').attr('fill', (id) => this.col(this.byId.get(id) as LIdea)).attr('opacity', 0.95), (id) => a[id] as Box);
    const mid = (id: string): Box => {
      const A = a[id] as Box, B = b[id] as Box;
      return toRiver ? { x: B.x, y: B.y + B.h / 2 - A.h / 2, w: A.w, h: A.h, rx: A.rx } : { x: A.x, y: A.y + A.h / 2 - B.h / 2, w: B.w, h: B.h, rx: B.rx };
    };
    const t1 = rs.transition().delay((id: string) => (this.byId.get(id) as LIdea).lane * 28).duration(toRiver ? 620 : 340).ease(toRiver ? d3.easeCubicInOut : d3.easeCubicIn);
    set(t1, mid);
    const t2 = t1.transition().duration(toRiver ? 380 : 620).ease(toRiver ? d3.easeCubicOut : d3.easeCubicInOut);
    set(t2, (id) => b[id] as Box);
    t2.end().catch(() => {}).then(() => {
      finish();
      requestAnimationFrame(() => { this.svgEl.classList.remove('out'); ov.transition().duration(220).attr('opacity', 0).remove(); this.morphing = false; });
    });
  }
}

export type { Model };
