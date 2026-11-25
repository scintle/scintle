import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';

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

export function BriefDialog({ body }: { body: string }) {
  const { setDialog, toast } = useStore();
  const id = /\((I-\d+)\)/.exec(body)?.[1] ?? '';
  const command = `/scintle:plan ${id}`;
  const copy = async (text: string, what: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast('Copy failed. Select the text and copy it by hand.');
    }
  };
  return (
    <Modal onClose={() => setDialog(null)} wide label="Plan implementation">
      <header>
        <div className="eyebrow">Plan implementation · {id}</div>
        <h2>Hand this idea to your planner</h2>
      </header>
      <div className="body">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
          Paste <code>{command}</code> into any Claude Code session. It loads this brief and starts planning in plan mode.
          The plan comes back to this idea's timeline.
        </p>
        <pre className="brief">{body}</pre>
      </div>
      <footer>
        <button className="btn ghost" onClick={() => void copy(body, 'Brief')}>Copy brief</button>
        <button className="btn primary" autoFocus onClick={() => void copy(command, 'Command')}>Copy {command}</button>
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
        <p className="hint">Or run <code>/scintle:add</code> in a Claude Code session inside that folder. Scintle reads its top-level Markdown, plus plans, specs, context, decisions and reports folders inside it.</p>
      </div>
    </Modal>
  );
}
