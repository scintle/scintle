/** ⌘K: fixed phrasings answered locally; anything else goes to the model as a last resort. */

import { useMemo, useState } from 'react';
import { post, type AskReply } from '../lib/api';
import { CLOSED_STAGES, isUnsure, namesOf, relTime } from '../lib/derive';
import type { Ev, Idea, Link } from '../lib/types';
import { useStore } from '../store';
import { Modal } from './Dialogs';

type Item = { key: string; label: string; hint?: string; run: () => void };

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function findIdea(q: string, ideas: Idea[], byIdea: Map<string, Ev[]>): Idea | undefined {
  const n = norm(q);
  if (n === '') return undefined;
  const score = (i: Idea): number => {
    const names = namesOf(byIdea.get(i.id) ?? [], i).map(norm);
    if (i.id.toLowerCase() === n) return 3;
    if (names.some((x) => x === n)) return 2;
    return names.some((x) => x.includes(n) || n.includes(x)) ? 1 : 0;
  };
  return ideas.map((i) => ({ i, s: score(i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0]?.i;
}

/** Follow pivots, spawns and merges forward to where an idea lives now. */
function descendant(id: string, links: Link[]): string {
  const seen = new Set([id]);
  let cur = id;
  for (;;) {
    const next = links.find((l) => l.from_idea === cur && l.type !== 'spawn' && !seen.has(l.to_idea));
    if (!next) return cur;
    seen.add(next.to_idea);
    cur = next.to_idea;
  }
}

function ancestor(id: string, links: Link[]): string {
  const seen = new Set([id]);
  let cur = id;
  for (;;) {
    const prev = links.find((l) => l.to_idea === cur && !seen.has(l.from_idea));
    if (!prev) return cur;
    seen.add(prev.from_idea);
    cur = prev.from_idea;
  }
}

export function CommandBar({ byIdea }: { byIdea: Map<string, Ev[]> }) {
  const { snap, setDialog, select, toast } = useStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const ideas = snap?.ideas ?? [];
  const links = snap?.links ?? [];
  const close = (): void => setDialog(null);
  const open = (id: string, event: number | null = null): void => {
    select(id, event);
    close();
  };

  const ask = async (): Promise<void> => {
    setAsking(true);
    try {
      const r = await post<AskReply>('/api/ask', { q });
      if (r.kind === 'select') open(r.idea);
      else setAnswer(r.text);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  const items = useMemo<Item[]>(() => {
    const t = q.trim();
    const where = /^where (?:did|does|is) (.+?) (?:end up|now|go)\??$/i.exec(t);
    const start = /^how did (.+?) (?:start|begin)\??$/i.exec(t);
    const neu = /^new(?: idea)?:? (.+)$/i.exec(t);
    const out: Item[] = [];

    if (neu?.[1]) out.push({ key: 'new', label: `Capture “${neu[1]}”`, hint: 'New idea', run: () => setDialog('new') });
    if (where?.[1]) {
      const i = findIdea(where[1], ideas, byIdea);
      if (i) {
        const end = descendant(i.id, links);
        const e = ideas.find((x) => x.id === end);
        out.push({ key: 'where', label: `${i.title} ended up as ${e?.title ?? end}`, hint: e?.stage, run: () => open(end) });
      }
    }
    if (start?.[1]) {
      const i = findIdea(start[1], ideas, byIdea);
      if (i) {
        const root = ancestor(i.id, links);
        const born = (byIdea.get(root) ?? []).find((e) => e.type === 'born');
        out.push({ key: 'start', label: `It started as ${ideas.find((x) => x.id === root)?.title ?? root}`, hint: born ? relTime(born.ts) : '', run: () => open(root, born?.id ?? null) });
      }
    }
    if (/quiet/i.test(t)) {
      const week = Date.now() - 7 * 86_400_000;
      for (const i of ideas.filter((x) => !CLOSED_STAGES.includes(x.stage) && Date.parse(x.updated_at) < week)) {
        out.push({ key: `q${i.id}`, label: i.title, hint: `quiet · ${relTime(i.updated_at)}`, run: () => open(i.id) });
      }
    }
    if (/today|changed/i.test(t)) {
      const day = Date.now() - 86_400_000;
      for (const i of ideas.filter((x) => Date.parse(x.updated_at) > day)) {
        out.push({ key: `d${i.id}`, label: i.title, hint: relTime(i.updated_at), run: () => open(i.id) });
      }
    }
    if (out.length === 0) {
      const n = norm(t);
      const hits = ideas.filter((i) => n === '' || namesOf(byIdea.get(i.id) ?? [], i).some((x) => norm(x).includes(n)) || i.id.toLowerCase() === n);
      for (const i of hits.slice(0, 8)) {
        const unsure = (byIdea.get(i.id) ?? []).some(isUnsure);
        out.push({ key: i.id, label: i.title, hint: `${i.id} · ${i.stage}${unsure ? ' · unsure' : ''}`, run: () => open(i.id) });
      }
    }
    if (t === '') {
      out.unshift(
        { key: 'h-new', label: 'New idea…', run: () => setDialog('new') },
        { key: 'h-quiet', label: "What's gone quiet?", run: () => setQ("what's quiet") },
        { key: 'h-today', label: 'What changed today?', run: () => setQ('what changed today') },
      );
    } else {
      out.push({ key: 'ask', label: asking ? 'Asking Claude…' : `Ask Claude: “${t}”`, hint: 'uses one model call', run: () => void ask() });
    }
    return out;
  }, [q, ideas, links, byIdea, asking]);

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter') items[active]?.run();
    else return;
    e.preventDefault();
  };

  return (
    <Modal onClose={close} label="Ask the board">
      <div className="cmd">
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); setAnswer(null); }}
          onKeyDown={onKey}
          placeholder="Where did … end up? · How did … start? · What's quiet? · new idea …"
          aria-label="Ask the board"
        />
        <ul role="listbox">
          {items.map((it, i) => (
            <li key={it.key}>
              <button role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={it.run}>
                <span>{it.label}</span>
                {it.hint && <span className="hint">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        {answer && <div className="answer">{answer}</div>}
      </div>
    </Modal>
  );
}
