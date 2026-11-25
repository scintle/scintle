import { useEffect, useMemo } from 'react';
import { AppBar } from './components/AppBar';
import { CommandBar } from './components/CommandBar';
import { BriefDialog, ConsentDialog, NewIdeaDialog, Toasts, FoldersDialog } from './components/Dialogs';
import { IdeaPanel } from './components/IdeaPanel';
import { Question } from './components/Question';
import { TelemetryAsk, TelemetryDialog } from './components/Telemetry';
import { HelpDialog } from './components/Help';
import { Consent, FirstRun, ReadBanner } from './components/ReadStatus';
import { eventsByIdea, ideasInProject } from './lib/derive';
import { connectStream, useStore } from './store';
import { Board } from './views/Board';
import { buildModel, type Range } from './lens/model';
import type { RangeChoice } from './store';

const DAY = 86_400_000;
function rangeBounds(r: RangeChoice, nowIso: string | undefined): Range {
  if (r.kind === 'all') return { from: null, to: null };
  if (r.kind === 'last') return { from: Date.parse(nowIso ?? new Date().toISOString()) - r.days * DAY, to: null };
  return { from: r.from, to: r.to };
}
import { Lineage, Overview } from './views/Lineage';

export function App() {
  const { snap, events, error, view, project, selected, dialog, setDialog, select, load, range, groups, reasons, reel } = useStore();

  useEffect(() => {
    void load();
    return connectStream();
  }, [load]);

  // #idea=I-010 opens that idea: how the Claude Code companion's "Open dashboard" lands on it.
  const hasSnap = snap !== null;
  useEffect(() => {
    if (!hasSnap) return;
    const focus = (): void => {
      const id = /#idea=(I-\d+)/.exec(location.hash)?.[1];
      if (id) select(id, null);
    };
    focus();
    addEventListener('hashchange', focus);
    return () => removeEventListener('hashchange', focus);
  }, [hasSnap, select]);

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
  const bounds = useMemo(() => rangeBounds(range, snap?.now), [range, snap?.now]);
  // Counts come from the unfiltered model so each chip says how many it would show.
  const all = useMemo(
    () => (snap && view !== 'board' ? buildModel(visible, byIdea, snap.links, snap.now, { logos: snap.logos, range: bounds }) : null),
    [snap, view, visible, byIdea, bounds],
  );
  const model = useMemo(
    () => (snap && all && (groups.size > 0 || reasons.size > 0) ? buildModel(visible, byIdea, snap.links, snap.now, { logos: snap.logos, range: bounds, groups, reasons }) : all),
    [snap, all, groups, reasons, visible, byIdea, bounds],
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
              <TelemetryAsk />
              {view === 'board' || !model ? <Board ideas={visible} byIdea={byIdea} /> : <Lineage mode={view} model={model} all={all ?? model} />}
            </>
          )}
        </div>
        {/* A replay's feed takes the panel, even with an idea open; closing it brings the idea back. */}
        {reel && model ? <Overview model={model} /> : idea ? <IdeaPanel key={idea.id} idea={idea} events={byIdea.get(idea.id) ?? []} /> : model && <Overview model={model} />}
      </main>
      {dialog === 'new' && <NewIdeaDialog />}
      {dialog === 'cmd' && <CommandBar byIdea={byIdea} />}
      {dialog === 'folders' && <FoldersDialog />}
      {dialog === 'telemetry' && <TelemetryDialog />}
      {dialog === 'help' && <HelpDialog />}
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
