/** The opt-in daily usage count (D26): asked once, off unless the person says yes, with the exact message shown. */

import type { Snapshot } from '../lib/types';
import { useStore } from '../store';
import { Modal } from './Dialogs';

const DOCS = 'https://scintle.github.io/scintle/trust/telemetry/';

const WHY: Record<string, string> = {
  'not-asked': 'Off. Nothing is sent until you say yes.',
  declined: 'Off. Nothing is sent.',
  DO_NOT_TRACK: 'Off: DO_NOT_TRACK is set on this machine, which overrides a yes.',
  SCINTLE_TELEMETRY_DISABLED: 'Off: SCINTLE_TELEMETRY_DISABLED is set, which overrides a yes.',
  CI: 'Off: this looks like a CI machine.',
  'no-endpoint': 'On, but this build has no collector address (only official releases send), so nothing leaves.',
};

/** The one-time question, shown after the first read was allowed. "No thanks" and closing are the same answer. */
export function TelemetryAsk() {
  const { snap, act, setDialog } = useStore();
  const t = snap?.telemetry;
  if (!snap?.consent || !t || t.blockedBy !== 'not-asked') return null;
  const answer = (on: boolean): void => void act('/api/telemetry', { on }, on ? 'Thanks: one anonymous message a day' : 'Nothing will be sent');
  return (
    <div className="question telemetry-ask" role="region" aria-label="Usage sharing">
      <span className="eyebrow">One question</span>
      <p>Share an anonymous daily count? No ID, nothing about your ideas. <button className="q-idea" onClick={() => setDialog('telemetry')}>See the exact message</button></p>
      <div className="acts">
        <button className="btn small" onClick={() => answer(true)}>Yes, share</button>
        <button className="btn small ghost" onClick={() => answer(false)}>No thanks</button>
      </div>
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

export function TelemetryDialog() {
  const { snap, act, setDialog } = useStore();
  const t: Snapshot['telemetry'] | undefined = snap?.telemetry;
  if (!t) return null;
  const on = t.consent === 'yes';
  return (
    <Modal onClose={() => setDialog(null)} label="Usage sharing">
      <div className="body telemetry">
        <h2>Usage sharing</h2>
        <p className="muted">If you say yes, Scintle sends at most one anonymous message a day, so we can count how many people use it. There is no ID: nothing links one day’s message to the next. Nothing about your ideas, sessions or folders is ever in it.</p>
        <p className="status"><b>{t.blockedBy === null ? 'On.' : WHY[t.blockedBy]}</b></p>
        <h3>The next message would be</h3>
        <Json value={t.next} />
        {t.lastPayload && <><h3>Last sent {t.lastSentAt?.slice(0, 10)}</h3><Json value={t.lastPayload} /></>}
        <div className="acts">
          {on
            ? <button className="btn" onClick={() => void act('/api/telemetry', { on: false }, 'Turned off; nothing will be sent')}>Turn off</button>
            : <button className="btn primary" onClick={() => void act('/api/telemetry', { on: true }, 'Thanks: one anonymous message a day')}>Turn on</button>}
          <a className="btn ghost" href={DOCS} target="_blank" rel="noreferrer">What each field means</a>
        </div>
        <p className="hint">Also: <code>scintle telemetry status</code> in a terminal, or set <code>DO_NOT_TRACK=1</code> to keep it off everywhere.</p>
      </div>
    </Modal>
  );
}
