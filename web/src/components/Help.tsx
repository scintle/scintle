/** Help and feedback: the docs, a new GitHub issue, and diagnostics shown before they're copied. */

import { useEffect, useState } from 'react';
import { getDiagnostics } from '../lib/api';
import { useStore } from '../store';
import { Modal } from './Dialogs';

const DOCS = 'https://scintle.github.io/scintle/';
const ISSUES = 'https://github.com/scintle/scintle/issues/new/choose';

export function HelpDialog() {
  const { setDialog, toast } = useStore();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    getDiagnostics().then((d) => setText(d.text), (e: Error) => setText(`Could not collect diagnostics: ${e.message}`));
  }, []);
  const copy = async (): Promise<void> => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Diagnostics copied');
    } catch {
      toast('Copy failed; select the text and copy it by hand');
    }
  };
  return (
    <Modal onClose={() => setDialog(null)} label="Help and feedback">
      <div className="body telemetry help">
        <h2>Help and feedback</h2>
        <p className="muted">Scintle is in beta, and every report helps. Bugs, wrong ideas, confusing moments: all welcome.</p>
        <div className="acts">
          <a className="btn primary" href={ISSUES} target="_blank" rel="noreferrer">Send feedback</a>
          <a className="btn ghost" href={DOCS} target="_blank" rel="noreferrer">Read the docs</a>
        </div>
        <h3>Diagnostics for a bug report</h3>
        <p className="muted">Versions, counts and recent error lines with secrets and paths removed. No idea names, quotes or session text. This is everything that gets copied:</p>
        <pre className="json">{text ?? 'Collecting…'}</pre>
        <div className="acts">
          <button className="btn" disabled={text === null} onClick={() => void copy()}>Copy diagnostics</button>
        </div>
      </div>
    </Modal>
  );
}
