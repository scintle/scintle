/** App state: the server snapshot plus what the person is looking at. One store, no other source of truth. */

import { create } from 'zustand';
import { getState, post } from './lib/api';
import { parseEvents } from './lib/derive';
import type { ActionResult, Ev, Snapshot, Undo } from './lib/types';

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
  dialog: null | 'new' | 'cmd' | 'consent' | { brief: string };
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
  view: remembered<View>('scintle.view', 'board'),
  project: remembered<string>('scintle.project', '') || null,
  selected: null,
  openEvent: null,
  dialog: null,
  toasts: [],

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
