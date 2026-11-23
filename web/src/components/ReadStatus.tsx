/** Reading progress, the first-read offer, and read errors: so the board never looks stuck or silently wrong. */

import { useState } from 'react';
import { post } from '../lib/api';
import type { Snapshot } from '../lib/types';
import { useStore } from '../store';
import { Mark } from './AppBar';

const SECONDS_PER_CHUNK = 12;

function minutes(n: number): string {
  if (n < 1) return 'under a minute';
  return n < 1.5 ? 'about a minute' : `about ${Math.round(n)} minutes`;
}

function eta(p: NonNullable<Snapshot['progress']>): string {
  const left = p.total - p.done;
  if (p.done === 0) return minutes((left * SECONDS_PER_CHUNK) / 60);
  const perChunk = (Date.now() - Date.parse(p.startedAt)) / 1000 / p.done;
  return `${minutes((left * perChunk) / 60)} left`;
}

function useSync(): [boolean, () => Promise<void>] {
  const { toast, load } = useStore();
  const [busy, setBusy] = useState(false);
  return [busy, async () => {
    setBusy(true);
    try {
      await post('/api/sync');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      void load();
    }
  }];
}

/** A slim bar while a read is under way, and the last read error if there is one. */
export function ReadBanner() {
  const snap = useStore((s) => s.snap);
  const load = useStore((s) => s.load);
  const [busy, sync] = useSync();
  if (!snap) return null;
  const p = snap.progress;
  const err = snap.readError;
  return (
    <>
      {p && p.total > 1 && (
        <div className="reading" role="status" aria-live="polite">
          <div className="reading-row">
            <span className="spinner" aria-hidden="true" />
            <span><b>Reading your sessions</b> · {p.done} of {p.total} chunks · {eta(p)}</span>
          </div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} /></div>
        </div>
      )}
      {err && !p && (
        <div className={`read-error${err.capped ? ' capped' : ''}`} role="alert">
          <p>{err.message}</p>
          <div className="acts">
            {!err.capped && <button className="btn small" disabled={busy} onClick={() => void sync()}>{busy ? 'Retrying…' : 'Try again'}</button>}
            <button className="btn small ghost" onClick={async () => { await post('/api/sync/dismiss').catch(() => null); void load(); }}>Dismiss</button>
          </div>
        </div>
      )}
    </>
  );
}

/** The consent card: what Scintle will read, what it costs, and the two ways to say yes. */
export function Consent({ onDone }: { onDone?: () => void }) {
  const { snap, toast, load, setDialog } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  if (!snap) return null;
  const w = snap.waiting;
  const go = async (mode: 'all' | 'new-only'): Promise<void> => {
    setBusy(mode);
    try {
      await post('/api/consent', { mode });
      toast(mode === 'all' ? 'Analyzing started' : 'Analyzing new sessions from now on');
      onDone?.();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
      void load();
    }
  };
  return (
    <div className="first">
      <Mark size={40} tile />
      <h2>Start analyzing your sessions</h2>
      <p>Scintle keeps each idea's story by reading your Claude Code sessions with your own Claude Code login. Nothing is read until you say so.</p>
      <ul className="consent-list">
        <li><b>Your history:</b> {w.sessions > 0 ? <>{w.sessions} {w.sessions === 1 ? 'session' : 'sessions'}, about {w.chunks} model {w.chunks === 1 ? 'call' : 'calls'} and {minutes((w.chunks * SECONDS_PER_CHUNK) / 60)}.</> : 'nothing waiting.'}</li>
        <li><b>New sessions:</b> read in batches, about 3 calls per working session.</li>
        <li><b>What's sent:</b> what you said and what Claude answered, with secrets redacted first. A daily cap of {snap.calls.cap} calls applies.</li>
      </ul>
      <div className="acts center">
        <button className="btn primary" disabled={busy !== null} onClick={() => void go('all')}>{busy === 'all' ? 'Starting…' : 'Start analyzing'}</button>
        {w.sessions > 0 && <button className="btn" disabled={busy !== null} onClick={() => void go('new-only')}>Only new sessions</button>}
        {!onDone && <button className="btn ghost" onClick={() => setDialog('new')}>Not now</button>}
      </div>
    </div>
  );
}

/** The empty board: ask first, show the first read in progress, or invite a first idea. */
export function FirstRun() {
  const { snap, setDialog } = useStore();
  if (!snap) return null;
  const p = snap.progress;

  if (!snap.consent) return <div className="state"><Consent /></div>;
  if (p) {
    return (
      <div className="state">
        <div className="first">
          <Mark size={40} tile />
          <h2>Reading your history</h2>
          <p>{p.total > 0 ? `${p.done} of ${p.total} chunks read · ${eta(p)}.` : 'Starting…'} Ideas appear on the board as each session finishes; you can keep working.</p>
          <div className="bar big" aria-hidden="true"><i style={{ width: `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} /></div>
        </div>
      </div>
    );
  }
  return (
    <div className="state">
      <div className="first">
        <Mark size={40} tile />
        <h2>Your ideas will gather here</h2>
        <p>Keep working in Claude Code. Scintle reads your sessions as you go and keeps each idea's story. Or capture one now.</p>
        <button className="btn primary" onClick={() => setDialog('new')}>New idea</button>
      </div>
    </div>
  );
}
