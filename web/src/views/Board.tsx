import { useMemo } from 'react';
import { CLOSED_STAGES, leftOff, RESOLUTION_COLOR, RESOLUTION_LABEL, namesOf, relTime, STAGE_LABEL } from '../lib/derive';
import type { Ev, Idea, Source, Stage } from '../lib/types';
import { useStore } from '../store';
import { IdeaMark } from '../components/IdeaMark';

const COLUMNS: Stage[] = ['seed', 'exploring', 'planned', 'building', 'parked'];

function sourceNote(events: Ev[], sources: Record<string, Source>): string | null {
  const last = [...events].reverse().find((e) => e.session_id !== null);
  const s = last?.session_id ? sources[last.session_id] : undefined;
  if (s?.state === 'expiring') return s.expiresInDays === 0 ? 'chat expires today' : `chat expires in ${s.expiresInDays}d`;
  if (s?.state === 'deleted') return 'chat deleted · excerpts saved';
  return null;
}

type CardProps = { idea: Idea; events: Ev[]; sources: Record<string, Source>; logo: string | undefined; nameOf: (id: string) => string };

function Card({ idea, events, sources, logo, nameOf }: CardProps) {
  const { selected, select } = useStore();
  const names = namesOf(events, idea);
  const note = sourceNote(events, sources);
  return (
    <button
      className="card"
      aria-current={selected === idea.id}
      onClick={() => select(selected === idea.id ? null : idea.id)}
    >
      {names.length > 1 && (
        <div className="trail">formerly {names.slice(0, -1).join(' → ')}</div>
      )}
      <h3><IdeaMark color={`var(--s-${idea.stage})`} logo={logo} size={20} />{idea.title}</h3>
      <p className="left">{leftOff(events, nameOf)}</p>
      <div className="meta">
        <span className="id">{idea.id}</span>
        {idea.resolution && (
          <span className="pill" style={{ color: RESOLUTION_COLOR[idea.resolution], borderColor: `color-mix(in srgb, ${RESOLUTION_COLOR[idea.resolution]} 40%, transparent)` }}>
            {RESOLUTION_LABEL[idea.resolution]}
          </span>
        )}
        {note && <span className="pill warn">{note}</span>}
        <span className="grow" />
        <span>{relTime(idea.updated_at)}</span>
      </div>
    </button>
  );
}

export function Board({ ideas, byIdea }: { ideas: Idea[]; byIdea: Map<string, Ev[]> }) {
  const snap = useStore((s) => s.snap);
  const sources = snap?.sources ?? {};
  const nameOf = (id: string): string => snap?.ideas.find((i) => i.id === id)?.title ?? id;
  const columns = useMemo(() => COLUMNS.map((stage) => ({ stage, ideas: ideas.filter((i) => i.stage === stage) })), [ideas]);
  const closed = ideas.filter((i) => CLOSED_STAGES.includes(i.stage));

  return (
    <div className="board">
      <div className="cols">
      {columns.map(({ stage, ideas: list }) => (
        <section className="col" key={stage} aria-label={STAGE_LABEL[stage]}>
          <div className="col-head">
            <i className="dot" style={{ background: `var(--s-${stage})`, color: `var(--s-${stage})` }} />
            <h2>{STAGE_LABEL[stage]}</h2>
            <span className="n">{list.length}</span>
          </div>
          {list.length === 0 && <div className="col-empty">{stage === 'seed' ? 'New ideas land here' : 'Nothing here'}</div>}
          {list.map((i) => <Card key={i.id} idea={i} events={byIdea.get(i.id) ?? []} sources={sources} logo={snap?.logos[i.id]} nameOf={nameOf} />)}
        </section>
      ))}
      </div>
      {closed.length > 0 && (
        <details className="shelf">
          <summary>Closed · {closed.length} released, dropped or evolved</summary>
          <div className="grid">
            {closed.map((i) => <Card key={i.id} idea={i} events={byIdea.get(i.id) ?? []} sources={sources} logo={snap?.logos[i.id]} nameOf={nameOf} />)}
          </div>
        </details>
      )}
    </div>
  );
}
