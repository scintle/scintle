/** Applies a sanitized extraction under rules the model is not trusted with (context/extraction.md). */

import { transact, type Db } from '../store/db.ts';
import { addEvent, addLink, createIdea, getIdea, type QuoteBy } from '../store/ledger.ts';
import type { Extraction } from './schema.ts';
import type { SegTurn } from './segment.ts';

const LOW_CONFIDENCE = 0.6;
const EXCERPT_MAX = 1200;

const flat = (s: string): string => s.replace(/\s+/g, ' ').trim();

export type ApplyResult = { ideas: number; events: number; dropped: string[]; question: boolean };

function excerpt(turns: readonly SegTurn[], seq: number): string {
  const i = turns.findIndex((t) => t.seq === seq);
  const around = turns.slice(Math.max(0, i - 1), i + 2);
  const text = around.map((t) => `${t.role}: ${flat(t.text)}`).join('\n');
  return text.length <= EXCERPT_MAX ? text : `${text.slice(0, EXCERPT_MAX)} …`;
}

const speaker = (role: string): QuoteBy => (role === 'assistant' ? 'claude' : role === 'doc' ? 'document' : 'you');

export function applyExtraction(db: Db, sessionId: string, turns: readonly SegTurn[], x: Extraction): ApplyResult {
  const result: ApplyResult = { ideas: 0, events: 0, dropped: [], question: false };
  const bySeq = new Map(turns.map((t) => [t.seq, t]));
  const evidence = (seq: number, quote: string): { ts: string; quote: string; quoteBy: QuoteBy; excerpt: string } | undefined => {
    const t = bySeq.get(seq);
    if (t === undefined || !flat(t.text).includes(flat(quote)) || flat(quote) === '') return undefined;
    return { ts: t.ts ?? new Date().toISOString(), quote: flat(quote), quoteBy: speaker(t.role), excerpt: excerpt(turns, seq) };
  };

  const mergeTargets = new Set(x.events.filter((e) => e.type === 'merged').map((e) => String(e.payload['into'] ?? '')));
  const onlyMergeTarget = (ref: string): boolean =>
    mergeTargets.has(ref) && !x.events.some((e) => e.type !== 'merged' && (e.idea === ref || e.payload['to'] === ref));

  transact(db, () => {
    const refs = new Map<string, string>();
    for (const n of x.new_ideas) {
      if (onlyMergeTarget(n.ref)) continue;
      const ev = evidence(n.seq, n.quote);
      if (ev === undefined) {
        result.dropped.push(`new idea "${n.title}": quote not found at [${n.seq}]`);
        continue;
      }
      refs.set(n.ref, createIdea(db, n.title.trim(), n.problem.trim(), {
        ...ev, origin: 'inferred', confidence: n.confidence, sessionId, turnSeq: n.seq,
      }));
      result.ideas++;
    }
    const resolve = (ref: string): string | undefined => refs.get(ref) ?? (getIdea(db, ref) ? ref : undefined);

    const merges = x.events.filter((e) => e.type === 'merged');
    if (merges.length > 0) {
      const into = String(merges[0]?.payload['into'] ?? '');
      const target = x.new_ideas.find((n) => n.ref === into);
      ask(db, sessionId, resolve(merges[0]?.idea ?? '') ?? null, 'merge', {
        parents: merges.map((m) => m.idea), into: target ?? into, quote: merges[0]?.quote,
      });
      result.question = true;
    }

    for (const e of x.events) {
      if (e.type === 'merged') continue;
      const ideaId = resolve(e.idea);
      const ev = evidence(e.seq, e.quote);
      if (ideaId === undefined || ev === undefined) {
        result.dropped.push(`${e.type} on ${e.idea}: ${ideaId === undefined ? 'unknown idea' : `quote not found at [${e.seq}]`}`);
        continue;
      }
      const payload = { ...e.payload };
      // Only the person may say they were not interested (D24).
      if (e.type === 'dropped' && payload['reason'] === 'not-interested') payload['reason'] = 'other';
      const linked = e.type === 'pivoted' || e.type === 'spawned' ? resolve(String(payload['to'] ?? '')) : undefined;
      if ((e.type === 'pivoted' || e.type === 'spawned') && (linked === undefined || linked === ideaId)) {
        result.dropped.push(`${e.type} on ${e.idea}: target ${String(payload['to'])} ${linked === ideaId ? 'is itself' : 'unknown'}`);
        continue;
      }
      if (linked !== undefined) payload['to'] = linked;
      const id = addEvent(db, {
        ideaId, type: e.type, ...ev, payload, origin: 'inferred', confidence: e.confidence, sessionId, turnSeq: e.seq,
      });
      if (linked !== undefined) addLink(db, ideaId, linked, e.type === 'pivoted' ? 'pivot' : 'spawn', id);
      result.events++;
      if ((e.type === 'pivoted' || e.type === 'narrowed') && e.confidence < LOW_CONFIDENCE && !result.question) {
        result.question = ask(db, sessionId, ideaId, 'pivot-or-narrow', { event: id, quote: ev.quote });
      }
    }
    if (x.question !== null && !result.question && x.question.kind !== 'merge') {
      result.question = ask(db, sessionId, resolve(x.question.idea) ?? null, x.question.kind, { text: x.question.text });
    }
  });
  return result;
}

/** At most one open question per session; later ones are dropped, not queued on screen. */
function ask(db: Db, sessionId: string, ideaId: string | null, kind: string, payload: object): boolean {
  const open = db.prepare("SELECT 1 FROM questions WHERE session_id = ? AND state = 'open'").get(sessionId);
  if (open !== undefined) return false;
  // "Is this idea back?" is asked once per idea until answered, however many sessions raise it.
  if (kind === 'alive' && db.prepare("SELECT 1 FROM questions WHERE kind = 'alive' AND idea_id IS ? AND state = 'open'").get(ideaId)) return false;
  db.prepare('INSERT INTO questions (idea_id, kind, payload, session_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(ideaId, kind, JSON.stringify(payload), sessionId, new Date().toISOString());
  return true;
}
