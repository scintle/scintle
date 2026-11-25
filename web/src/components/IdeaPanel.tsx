import { useState } from 'react';
import { post, type Brief } from '../lib/api';
import { lineage, namesOf, nextStep, relTime } from '../lib/derive';
import type { Ev, Idea } from '../lib/types';
import { useStore } from '../store';
import { StageMenu } from './StageMenu';
import { IdeaMark } from './IdeaMark';
import { Timeline } from './Timeline';

const LINK_FROM = { pivot: 'Pivoted from', spawn: 'Spun off from', merge: 'Merged from' } as const;
const LINK_TO = { pivot: 'Pivoted into', spawn: 'Spun off', merge: 'Merged into' } as const;

export function IdeaPanel({ idea, events }: { idea: Idea; events: Ev[] }) {
  const { snap, select, act, setDialog, toast } = useStore();
  const step = nextStep(idea.stage);
  // A project's own logo is marked `?p=`, a drawn one `?v=`; only drawn ones can be redrawn.
  const ownLogo = snap?.logos[idea.id]?.includes('?p=') ?? false;
  const [busy, setBusy] = useState(false);
  const names = namesOf(events, idea);
  const links = lineage(snap?.links ?? [], idea.id);
  const title = (id: string): string => snap?.ideas.find((i) => i.id === id)?.title ?? id;
  const job = snap?.jobs.find((j) => j.idea_id === idea.id && j.kind === 'research');
  const researching = job?.status === 'running';

  const plan = async (): Promise<void> => {
    setBusy(true);
    try {
      const b = await post<Brief>(`/api/ideas/${idea.id}/brief`);
      setDialog({ brief: b.body });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const run = (action: 'research' | 'plan'): void => {
    if (action === 'plan') void plan();
    else void act(`/api/ideas/${idea.id}/research`, {}, 'Research started. It lands on the timeline when done.');
  };

  return (
    <aside className="panel" aria-label={`Idea ${idea.title}`}>
      <div className="panel-head">
        <button className="back" onClick={() => select(null)} title="Back to all ideas (Esc)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          All ideas
        </button>
        <div className="row">
          <StageMenu idea={idea} />
          <span className="eyebrow">{idea.id}</span>
          <span className="grow" />
          {!ownLogo && (
            <button className="btn ghost small" title="Ask Claude for another logo" onClick={() => void act(`/api/ideas/${idea.id}/logo`, {}, 'Drawing a new logo')}>New logo</button>
          )}
        </div>
        <h2><IdeaMark color={`var(--s-${idea.stage})`} logo={snap?.logos[idea.id]} size={28} />{idea.title}</h2>
        {names.length > 1 && <div className="names">formerly {names.slice(0, -1).join(' → ')}</div>}
        <p className="problem">{idea.problem || 'No problem statement yet.'}</p>
        {(links.from.length > 0 || links.to.length > 0) && (
          <div className="origins">
            {links.from.map((l) => (
              <button key={`f${l.id}`} onClick={() => select(l.from_idea)}>
                <span>{LINK_FROM[l.type]} <b>{title(l.from_idea)}</b></span><span className="go">open</span>
              </button>
            ))}
            {links.to.map((l) => (
              <button key={`t${l.id}`} onClick={() => select(l.to_idea)}>
                <span>{LINK_TO[l.type]} <b>{title(l.to_idea)}</b></span><span className="go">open</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {step && (
        <div className="next">
          <button className="btn primary" disabled={busy || (step.action === 'research' && researching)} onClick={() => run(step.action)}>
            {step.action === 'research' && researching ? 'Researching…' : step.label}
          </button>
          {step.secondary && (
            <button className="btn ghost" disabled={busy || (step.secondary.action === 'research' && researching)} onClick={() => run(step.secondary!.action)}>
              {step.secondary.action === 'research' && researching ? 'Researching…' : step.secondary.label}
            </button>
          )}
        </div>
      )}

      {job?.status === 'running' && (
        <div className="job" role="status"><span className="spinner" aria-hidden="true" />Researching in the background · started {relTime(job.started_at)}. It lands on the timeline when done.</div>
      )}
      {job?.status === 'failed' && (
        <div className="job failed" role="alert">
          <span>Research didn't finish: {job.error ?? 'unknown error'}</span>
          <button className="btn small" onClick={() => run('research')}>Try again</button>
        </div>
      )}
      <div className="panel-body">
        <Timeline events={events} />
      </div>
    </aside>
  );
}
