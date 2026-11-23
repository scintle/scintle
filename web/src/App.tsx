import { useEffect, useMemo } from 'react';
import { AppBar } from './components/AppBar';
import { CommandBar } from './components/CommandBar';
import { BriefDialog, ConsentDialog, NewIdeaDialog, Toasts } from './components/Dialogs';
import { IdeaPanel } from './components/IdeaPanel';
import { Question } from './components/Question';
import { Consent, FirstRun, ReadBanner } from './components/ReadStatus';
import { eventsByIdea, ideasInProject } from './lib/derive';
import { connectStream, useStore } from './store';
import { Board } from './views/Board';
import { buildModel } from './lens/model';
import { Lineage, Overview } from './views/Lineage';

export function App() {
  const { snap, events, error, view, project, selected, dialog, setDialog, select, load } = useStore();

  useEffect(() => {
    void load();
    return connectStream();
  }, [load]);

  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDialog(dialog === 'cmd' ? null : 'cmd');
      } else if (e.key === 'n' && !typing && dialog === null && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setDialog('new');
      } else if (e.key === 'Escape' && dialog === null && selected !== null) {
        select(null);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [dialog, selected, setDialog, select]);

  const byIdea = useMemo(() => eventsByIdea(events), [events]);
  const visible = useMemo(() => {
    if (!snap) return [];
    const ids = ideasInProject(snap, events, project);
    return snap.ideas.filter((i) => ids.has(i.id));
  }, [snap, events, project]);
  const idea = snap?.ideas.find((i) => i.id === selected);
  const model = useMemo(
    () => (snap && view !== 'board' ? buildModel(visible, byIdea, snap.links, snap.now, snap.logos) : null),
    [snap, view, visible, byIdea],
  );

  return (
    <div className="app">
      <AppBar />
      <main className="main">
        <div className="canvas">
          {!snap && !error && <Loading />}
          {!snap && error && <Failure message={error} />}
          {snap && snap.ideas.length === 0 && <><ReadBanner /><FirstRun /></>}
          {snap && snap.ideas.length > 0 && (
            <>
              <ReadBanner />
              <Question />
              {view === 'board' || !model ? <Board ideas={visible} byIdea={byIdea} /> : <Lineage mode={view} model={model} />}
            </>
          )}
        </div>
        {idea ? <IdeaPanel key={idea.id} idea={idea} events={byIdea.get(idea.id) ?? []} /> : model && <Overview model={model} />}
      </main>
      {dialog === 'new' && <NewIdeaDialog />}
      {dialog === 'cmd' && <CommandBar byIdea={byIdea} />}
      {dialog === 'consent' && <ConsentDialog><Consent onDone={() => setDialog(null)} /></ConsentDialog>}
      {dialog !== null && typeof dialog === 'object' && <BriefDialog body={dialog.brief} />}
      <Toasts />
    </div>
  );
}

function Loading() {
  return (
    <div className="board" aria-busy="true">
      {[0, 1, 2, 3].map((c) => (
        <div className="col" key={c}>{[0, 1, 2].map((r) => <div className="skeleton" key={r} />)}</div>
      ))}
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <div className="state">
      <div>
        <h2>Can't reach Scintle</h2>
        <p>{message}</p>
        <button className="btn" onClick={() => void useStore.getState().load()}>Try again</button>
      </div>
    </div>
  );
}
