/** The one open question: says what Scintle recorded, with answers that match it. "Later" is always fine. */

import { useStore } from '../store';

type Payload = { text?: string; quote?: string; event?: number; parents?: string[]; into?: { title?: string } | string };

export function Question() {
  const { snap, events, act, select } = useStore();
  const q = snap?.questions[0];
  if (!q) return null;
  const p = JSON.parse(q.payload) as Payload;
  const title = (id: string): string => `“${snap?.ideas.find((i) => i.id === id)?.title ?? id}”`;
  const ev = events.find((e) => e.id === p.event);
  const answer = (a: string, label: string): void => void act(`/api/questions/${q.id}/answer`, { answer: a }, label);
  const quote = p.quote ? <q className="said">{p.quote}</q> : null;

  let text: React.ReactNode;
  let actions: React.ReactNode;
  if (q.kind === 'merge') {
    const into = typeof p.into === 'object' && p.into.title ? ` into “${p.into.title}”` : '';
    text = <>Did {(p.parents ?? []).map(title).join(' and ')} merge{into}? {quote}</>;
    actions = <>
      <button className="btn small" onClick={() => answer('yes', 'Merged')}>Yes, merge them</button>
      <button className="btn small" onClick={() => answer('no', 'Kept separate')}>No, keep separate</button>
    </>;
  } else if (q.kind === 'pivot-or-narrow' && ev?.type === 'pivoted') {
    text = <>I recorded {title(ev.idea_id)} turning into a new idea, {title(String(ev.payload['to']))}, when you said {quote} Right?</>;
    actions = <>
      <button className="btn small" onClick={() => answer('keep', 'Kept as a new idea')}>Yes, a new idea</button>
      <button className="btn small" onClick={() => answer('remove', 'Pivot removed')}>No, not a pivot</button>
    </>;
  } else if (q.kind === 'pivot-or-narrow' && ev) {
    text = <>I recorded {title(ev.idea_id)} narrowing, when you said {quote} Same idea, smaller scope?</>;
    actions = <>
      <button className="btn small" onClick={() => answer('keep', 'Kept')}>Yes, same idea</button>
      <button className="btn small" onClick={() => answer('remove', 'Removed')}>No</button>
    </>;
  } else {
    text = p.text ?? 'Scintle has a question.';
    actions = null;
  }

  return (
    <div className="question" role="region" aria-label="Question">
      <span className="eyebrow">Quick check</span>
      <p>{text}</p>
      <div className="acts">
        {q.idea_id && <button className="btn small ghost" onClick={() => select(ev?.idea_id ?? q.idea_id, ev?.id ?? null)}>Show me</button>}
        {actions}
        <button className="btn small ghost" onClick={() => answer('later', 'Asked later')}>Later</button>
      </div>
    </div>
  );
}
