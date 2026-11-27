import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { post, type BriefItem, type BriefView } from '../lib/api';
import { EVENT_LABEL, STAGE_LABEL } from '../lib/derive';
import type { Stage } from '../lib/types';

function Modal({ children, onClose, wide = false, label }: { children: ReactNode; onClose: () => void; wide?: boolean; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

export function NewIdeaDialog({ initialTitle = '' }: { initialTitle?: string }) {
  const { setDialog, act, select } = useStore();
  const [title, setTitle] = useState(initialTitle);
  const [problem, setProblem] = useState('');
  const close = (): void => setDialog(null);
  const create = async (): Promise<void> => {
    if (title.trim() === '') return;
    const r = await act('/api/ideas', { title, problem }, `Captured "${title.trim()}"`);
    if (r.ok) {
      close();
      if (typeof r.id === 'string') select(r.id);
    }
  };
  return (
    <Modal onClose={close} label="New idea">
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <header>
          <div className="eyebrow">Capture</div>
          <h2>New idea</h2>
        </header>
        <div className="body">
          <label className="field">
            Name it in a few words
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Idea board that keeps itself" maxLength={120} />
          </label>
          <label className="field">
            Who hurts, and what's the pain? <span>Optional. Scintle fills this in as you talk about it.</span>
            <textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. Builders lose track of their ideas across chats"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void create(); }} />
          </label>
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={title.trim() === ''}>Create idea</button>
        </footer>
      </form>
    </Modal>
  );
}

const TONE: Record<string, string> = {
  parked: 'var(--s-parked)', revived: 'var(--s-exploring)', resumed: 'var(--s-exploring)', planned: 'var(--s-planned)',
  building: 'var(--s-building)', released: 'var(--good)', dropped: 'var(--bad)', pivoted: 'var(--ai)', spawned: 'var(--ai)',
};
const shortDay = (ts: string): string => (ts === '' ? '' : new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

function Moments({ items, problem = '' }: { items: BriefItem[]; problem?: string }) {
  const snap = useStore((st) => st.snap);
  const named = (l: string): string => (/^I-\d+$/.test(l) ? snap?.ideas.find((i) => i.id === l)?.title ?? l : l);
  return (
    <ol className="plan-moments">
      {items.map((m, i) => (
        <li key={i} style={{ ['--tone' as string]: TONE[m.type] ?? 'var(--faint)' }}>
          <div className="plan-when">
            {m.ts !== '' && <span className="mono">{shortDay(m.ts)}</span>}
            <span className="plan-tag">{EVENT_LABEL[m.type] ?? m.type}</span>
            {m.label !== '' && !(m.type === 'born' && m.label === problem) && <span className="plan-label">{named(m.label)}</span>}
          </div>
          {m.quote !== '' && <blockquote>“{m.quote}”</blockquote>}
        </li>
      ))}
    </ol>
  );
}

/** Plan implementation: the idea's brief drawn as its story, and three ways to hand it to Claude Code. */
export function BriefDialog({ body, view }: { body: string; view?: BriefView }) {
  const { setDialog, toast } = useStore();
  const id = view?.id ?? /\((I-\d+)\)/.exec(body)?.[1] ?? '';
  const command = `/scintle:plan ${id}`;
  const [opening, setOpening] = useState(false);
  const close = (): void => setDialog(null);
  const copy = async (text: string, what: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast('Copy failed. Select the text and copy it by hand.');
    }
  };
  const openSession = async (): Promise<void> => {
    setOpening(true);
    try {
      const r = await post<{ ok: boolean; cwd?: string; error?: string }>(`/api/ideas/${id}/plan-session`);
      if (r.ok) toast(`Opened a new Claude Code session in ${r.cwd ?? 'a terminal'}`);
      else { await copy(command, 'Command'); toast(`${r.error ?? 'Could not open a terminal'}. The command is copied instead.`); }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const sec = (key: string): BriefView['sections'][number] | undefined => view?.sections.find((x) => x.key === key);
  const rest = ['lifecycle', 'docs', 'open'].map(sec).filter((x) => x !== undefined && x.items.length > 0) as BriefView['sections'];
  return (
    <Modal onClose={close} wide label="Plan implementation">
      <header className="plan-head">
        <div className="eyebrow">Plan implementation · {id}</div>
        <button className="plan-x" aria-label="Close" onClick={close}>✕</button>
        {view ? (
          <>
            <div className="plan-title">
              <h2>{view.title}</h2>
              <span className="plan-stage" style={{ ['--sc' as string]: `var(--s-${view.stage})` }}><i />{STAGE_LABEL[view.stage as Stage] ?? view.stage}</span>
            </div>
            {view.problem !== '' && <p className="plan-problem">{view.problem}</p>}
            {(view.earlierNames.length > 0 || view.origins.length > 0) && (
              <p className="plan-formerly">
                {view.earlierNames.length > 0 && <>formerly {view.earlierNames.join(' → ')}</>}
                {view.earlierNames.length > 0 && view.origins.length > 0 && ' · '}
                {view.origins.length > 0 && <>grew out of {view.origins.join(', ')}</>}
              </p>
            )}
          </>
        ) : <h2>Hand this idea to your planner</h2>}
      </header>
      <div className="body plan-body">
        {view ? (
          <>
            {(sec('shaping')?.items.length ?? 0) > 0 && (
              <section><h3 className="plan-h">How it got here</h3><Moments items={sec('shaping')!.items} problem={view.problem} /></section>
            )}
            {rest.filter((x) => x.key === 'lifecycle').map((x) => <section key={x.key}><h3 className="plan-h">{x.title}</h3><Moments items={x.items} /></section>)}
            <div className="plan-pair">
              {(['decided', 'tried'] as const).map((k) => {
                const x = sec(k);
                return (
                  <section key={k}>
                    <h3 className="plan-h">{k === 'decided' ? 'Decisions' : 'Dead ends to avoid'}</h3>
                    {x && x.items.length > 0 ? <Moments items={x.items} /> : <p className="plan-none">None yet</p>}
                  </section>
                );
              })}
            </div>
            {rest.filter((x) => x.key !== 'lifecycle').map((x) => <section key={x.key}><h3 className="plan-h">{x.title}</h3><Moments items={x.items} /></section>)}
            <section className="plan-ask">
              <h3 className="plan-h">What Claude is asked</h3>
              <p>{view.ask}</p>
            </section>
            <p className="plan-back">✓ The plan comes back to this timeline once you approve it.</p>
          </>
        ) : <pre className="brief">{body}</pre>}
      </div>
      <footer className="plan-foot">
        <div className="plan-actions">
          <button className="btn ghost" onClick={() => void copy(body, 'Brief')}>Copy brief</button>
          <span className="plan-spacer" />
          <button className="plan-cmd" onClick={() => void copy(command, 'Command')} title="Copy, then paste into a session you already have open">
            <span aria-hidden="true">$</span> {command} <small>Copy</small>
          </button>
          <button className="btn primary" autoFocus disabled={opening} onClick={() => void openSession()}>{opening ? 'Opening…' : 'Plan in a new session'}</button>
        </div>
        <p className="plan-caption">Opens a terminal in this idea's project and starts Claude Code in plan mode.</p>
      </footer>
    </Modal>
  );
}

export function Toasts() {
  const { toasts, undo, dismiss } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.undo && <button onClick={() => void undo(t)}>Undo</button>}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

export { Modal };

export function ConsentDialog({ children }: { children: ReactNode }) {
  const setDialog = useStore((s) => s.setDialog);
  return (
    <Modal onClose={() => setDialog(null)} label="Start analyzing">
      <div className="body consent-body">{children}</div>
    </Modal>
  );
}

/** What Scintle reads (D25): Claude's own folder always, and only the folders added here besides. */
export function FoldersDialog() {
  const { snap, act, setDialog } = useStore();
  const [path, setPath] = useState('');
  const folders = snap?.folders ?? [];
  const add = async (): Promise<void> => {
    if ((await act('/api/folders', { path }, 'Folder added; its documents are read on the next catch-up')).ok) setPath('');
  };
  return (
    <Modal onClose={() => setDialog(null)} label="Folders Scintle reads">
      <div className="body folders">
        <h2>Folders Scintle reads</h2>
        <p className="muted">Scintle always reads Claude's own folder: your sessions and saved plans. Nothing else on your disk is read unless you add it here, like opening a folder in an editor.</p>
        <ul className="folder-list">
          <li className="fixed"><code>~/.claude</code><span>always</span></li>
          {folders.map((f) => (
            <li key={f.path}>
              <code>{f.path}</code>
              <span>{f.docs} {f.docs === 1 ? 'document' : 'documents'}</span>
              <button className="btn small ghost" title="Stop reading this folder and forget its document text; ideas stay" onClick={() => void act('/api/folders/remove', { path: f.path }, `Stopped reading ${f.path}`)}>Remove</button>
            </li>
          ))}
        </ul>
        <form className="add-folder" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/Workspace/my-project" aria-label="Folder path" spellCheck={false} />
          <button className="btn primary small" disabled={!path.trim()}>Add folder</button>
        </form>
        <p className="hint">Or run <code>/scintle add</code> in a Claude Code session inside that folder. Scintle reads its top-level Markdown, plus plans, specs, context, decisions and reports folders inside it.</p>
      </div>
    </Modal>
  );
}
