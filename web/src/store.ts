/** App state: the server snapshot plus what the person is looking at. One store, no other source of truth. */

import { create } from 'zustand';
import { getState, post } from './lib/api';
import { parseEvents } from './lib/derive';
import type { Caption } from './lens/lens';
import type { ActionResult, Ev, Resolution, Snapshot, Undo } from './lib/types';
import type { StatusGroup } from './lens/model';

/** Preset ranges in days, or a custom from/to (epoch ms, either end open). */
export type RangeChoice = { kind: 'all' } | { kind: 'last'; days: number } | { kind: 'custom'; from: number | null; to: number | null };

export type View = 'board' | 'river' | 'constellation';
type Toast = { id: number; text: string; undo?: Undo };

type State = {
  snap: Snapshot | null;
  events: Ev[];
  error: string | null;
  view: View;
  project: string | null;
  selected: string | null;
  openEvent: number | null;
  dialog: null | 'new' | 'cmd' | 'consent' | 'folders' | 'telemetry' | 'help' | { brief: string };
  groups: Set<StatusGroup>;
  /** Moments a replay has played so far, newest last; null when no replay is showing. */
  reel: Caption[] | null;
  setReel: (r: Caption[] | null | ((r: Caption[]) => Caption[])) => void;
  reasons: Set<Resolution>;
  toggleReason: (r: Resolution | null) => void;
  range: RangeChoice;
  toggleGroup: (g: StatusGroup | null) => void;
  setRange: (r: RangeChoice) => void;
  toasts: Toast[];
  load: () => Promise<void>;
  setView: (v: View) => void;
  setProject: (p: string | null) => void;
  select: (id: string | null, event?: number | null) => void;
  setOpenEvent: (id: number | null) => void;
  setDialog: (d: State['dialog']) => void;
  act: (path: string, body: object, label: string) => Promise<ActionResult>;
  undo: (t: Toast) => Promise<void>;
  dismiss: (id: number) => void;
  toast: (text: string) => void;
};

const remembered = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows refuse storage; preferences just won't persist.
  }
};

let toastId = 0;
let inflight: Promise<void> | null = null;

export const useStore = create<State>((set, get) => ({
  snap: null,
  events: [],
  error: null,
  view: remembered<View>('scintle.view', 'river'),
  project: remembered<string>('scintle.project', '') || null,
  selected: null,
  openEvent: null,
  dialog: null,
  toasts: [],
  groups: new Set(),
  reel: null,
  // A closed feed stays closed for the rest of that replay.
  setReel: (r) => set({ reel: typeof r === 'function' ? (get().reel === null ? null : r(get().reel ?? [])) : r }),
  reasons: new Set(),
  toggleReason: (r) => {
    if (r === null) return set({ reasons: new Set() });
    const next = new Set(get().reasons);
    if (next.has(r)) next.delete(r); else next.add(r);
    set({ reasons: next });
  },
  range: (() => {
    try {
      return JSON.parse(localStorage.getItem('scintle.range') ?? '{"kind":"all"}') as RangeChoice;
    } catch {
      return { kind: 'all' } as RangeChoice;
    }
  })(),
  toggleGroup: (g) => {
    if (g === null) return set({ groups: new Set() });
    const next = new Set(get().groups);
    if (next.has(g)) next.delete(g); else next.add(g);
    set({ groups: next });
  },
  setRange: (range) => {
    remember('scintle.range', JSON.stringify(range));
    set({ range });
  },

  load: async () => {
    // Coalesce bursts of change notifications into one fetch at a time.
    if (inflight) return inflight;
    inflight = getState()
      .then((snap) => set({ snap, events: parseEvents(snap.events), error: null }))
      .catch((e: Error) => set({ error: e.message }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  setView: (view) => {
    remember('scintle.view', view);
    set({ view });
  },
  setProject: (project) => {
    remember('scintle.project', project);
    set({ project });
  },
  select: (selected, event = null) => set({ selected, openEvent: event }),
  setOpenEvent: (openEvent) => set({ openEvent }),
  setDialog: (dialog) => set({ dialog }),

  act: async (path, body, label) => {
    let r: ActionResult;
    try {
      r = await post(path, body);
    } catch (e) {
      r = { ok: false, error: (e as Error).message };
    }
    if (r.ok) {
      const t: Toast = { id: ++toastId, text: label, ...(r.undo.kind !== 'none' ? { undo: r.undo } : {}) };
      set({ toasts: [...get().toasts.slice(-2), t] });
      setTimeout(() => get().dismiss(t.id), 6000);
    } else {
      get().toast(r.error);
    }
    await get().load();
    return r;
  },
  undo: async (t) => {
    get().dismiss(t.id);
    if (t.undo) await post('/api/undo', t.undo);
    await get().load();
    get().toast('Undone');
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  toast: (text) => {
    const t = { id: ++toastId, text };
    set({ toasts: [...get().toasts.slice(-2), t] });
    setTimeout(() => get().dismiss(t.id), 4000);
  },
}));

/** Live updates: the server pings on every change; we refetch. Reconnects on its own. */
export function connectStream(): () => void {
  const es = new EventSource('/api/stream');
  let version = -1;
  es.onmessage = (m) => {
    const v = (JSON.parse(m.data as string) as { version: number }).version;
    if (v !== version) {
      version = v;
      void useStore.getState().load();
    }
  };
  return () => es.close();
}
