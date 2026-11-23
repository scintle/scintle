import { useMemo } from 'react';
import { post } from '../lib/api';
import { projectsOf } from '../lib/derive';
import { useStore, type View } from '../store';

/**
 * The Scintle mark (logo direction 02, "Branching Track"): an ancestral trail forks; the active branch arcs up
 * to a spark while the other keeps going. `tile` draws the dark squircle app icon.
 */
export function Mark({ size = 22, tile = false }: { size?: number; tile?: boolean }) {
  const trail = tile ? '#9aa0b3' : 'var(--muted)';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      {tile && <rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="#161822" stroke="rgba(255,255,255,.12)" />}
      <g fill="none" strokeLinecap="round" strokeWidth="2.4">
        <path d="M7.2 23.6 13.4 17.2" stroke={trail} />
        <path d="M13.4 17.2c3.4-.9 6.6-.6 10.4.6" stroke={trail} />
        <path d="M13.4 17.2c2.4-4.6 5.4-7.6 9.4-8.6" stroke="#6467ff" strokeWidth="2.8" />
      </g>
      <circle cx="7.2" cy="23.6" r="2.3" fill={trail} />
      <circle cx="23.8" cy="17.8" r="2.1" fill={trail} />
      <circle cx="13.4" cy="17.2" r="1.9" fill={tile ? '#161822' : 'var(--surface)'} stroke={trail} strokeWidth="1.4" />
      <path d="M23 4.1l.9 2.9 2.9.9-2.9.9-.9 2.9-.9-2.9-2.9-.9 2.9-.9z" fill="#fff" />
      <circle cx="23" cy="7.9" r="1.3" fill="#fff" />
    </svg>
  );
}

const LENSES: { id: View; label: string }[] = [
  { id: 'river', label: 'River' },
  { id: 'constellation', label: 'Constellation' },
];

const lastLens = (): View => {
  try {
    return localStorage.getItem('scintle.lens') === 'constellation' ? 'constellation' : 'river';
  } catch {
    return 'river';
  }
};

export function AppBar() {
  const { snap, view, setView, project, setProject, setDialog, error, toast, load } = useStore();
  const projects = useMemo(() => (snap ? projectsOf(snap) : []), [snap]);
  const extracting = snap?.extracting ?? null;
  const isMac = navigator.platform.includes('Mac');

  return (
    <header className="appbar">
      <div className="brand">
        <Mark size={24} tile />
        <span className="word">Scintle</span>
        <nav className="seg pages" aria-label="Page">
          <button aria-pressed={view === 'board'} aria-current={view === 'board' ? 'page' : undefined} onClick={() => setView('board')}>Board</button>
          <button aria-pressed={view !== 'board'} aria-current={view !== 'board' ? 'page' : undefined} onClick={() => view === 'board' && setView(lastLens())}>Lineage</button>
        </nav>
        <span className="sep" />
        <label className="scope" title="Show ideas from one project">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h3.1l1.5 1.5h4.9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H3.25c-.83 0-1.5-.67-1.5-1.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          <span className="label">{project ?? 'All projects'}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <select value={project ?? ''} onChange={(e) => setProject(e.target.value || null)} aria-label="Project">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      {view === 'board' ? <span /> : (
        <nav className="seg" aria-label="Lens">
          {LENSES.map((v) => (
            <button key={v.id} aria-pressed={view === v.id} onClick={() => {
              try { localStorage.setItem('scintle.lens', v.id); } catch { /* storage refused */ }
              setView(v.id);
            }}>{v.label}</button>
          ))}
        </nav>
      )}

      <div className="bar-right">
        <button className="askbox" onClick={() => setDialog('cmd')} aria-label="Ask the board">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>Ask the board…</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button className="btn primary" onClick={() => setDialog('new')}>
          <span aria-hidden="true">＋</span> New idea
        </button>
        {snap && !error && !snap.consent ? (
          <button className="live catchup off" onClick={() => setDialog('consent')} title="Scintle isn't reading your sessions yet. Click to see what it would read and start.">
            <i />Analyzing off
          </button>
        ) : snap && !error && !extracting && snap.waiting.sessions > 0 ? (
          <button
            className="live catchup"
            title={`${snap.waiting.sessions} ${snap.waiting.sessions === 1 ? 'session has' : 'sessions have'} about ${Math.max(1, Math.round(snap.waiting.chars / 4000))}k tokens not yet read. Scintle reads them when a full chunk builds up, when a session ends, or after 30 min idle. Click to read now.`}
            onClick={async () => {
              const r = await post<{ sessions: number }>('/api/sync').catch(() => null);
              toast(r ? `Reading ${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'} now` : 'Could not reach Scintle');
              void load();
            }}
          >
            <i />Catch up<span className="calls">{snap.waiting.sessions} waiting</span>
          </button>
        ) : (
          <span
            className={`live${error ? ' down' : extracting ? ' busy' : ''}`}
            title={error ?? (snap ? `${extracting ? 'Reading a session' : 'Up to date'} · today: ${snap.calls.calls} of ${snap.calls.cap} model calls, ${Math.round((snap.calls.inputTokens + snap.calls.outputTokens) / 1000)}k tokens, ${snap.calls.minutes} min` : '')}
          >
            <i />{error ? 'Offline' : extracting ? 'Reading' : 'Live'}
            {snap && <span className="calls">{snap.calls.calls} calls</span>}
          </span>
        )}
      </div>
    </header>
  );
}
