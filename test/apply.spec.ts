import { beforeEach, describe, expect, it } from 'vitest';
import { applyExtraction } from '../server/extract/apply.ts';
import { sanitize, type Extraction } from '../server/extract/schema.ts';
import type { SegTurn } from '../server/extract/segment.ts';
import { openDb, type Db } from '../server/store/db.ts';
import { addEvent, allIdeas, getIdea, linksOf, liveEvents } from '../server/store/ledger.ts';

const turn = (seq: number, text: string, role = 'user'): SegTurn => ({ seq, ts: `2026-11-20T10:0${seq}:00.000Z`, role, text, files: [] });
const TURNS = [
  turn(0, 'I want a board that tracks my ideas across chats'),
  turn(1, 'Sure, an idea ledger.', 'assistant'),
  turn(2, 'call it Scintle instead of the ledger name'),
  turn(3, 'actually forget ideas, I want to track sprint velocity for teams'),
];
const x = (p: Partial<Extraction>): Extraction => ({ new_ideas: [], events: [], question: null, ...p });
const born = { ref: 'new:1', title: 'Idea ledger', problem: 'builders lose their ideas', seq: 0, quote: 'tracks my ideas across chats', confidence: 0.9 };

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path) VALUES ('s', 'claude-code', 'p', 'exact', '/x')").run();
});

describe('applyExtraction', () => {
  it('mints an idea with a dotted born event and its evidence', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    const [idea] = allIdeas(db);
    expect(idea).toMatchObject({ id: 'I-001', title: 'Idea ledger', stage: 'seed' });
    expect(liveEvents(db, 'I-001')[0]).toMatchObject({ type: 'born', state: 'dotted', quote: 'tracks my ideas across chats' });
  });

  it('keeps the id on a rename', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    applyExtraction(db, 's', TURNS, x({ events: [{ idea: 'I-001', type: 'renamed', payload: { from: 'Idea ledger', to: 'Scintle' }, confidence: 0.9, seq: 2, quote: 'call it Scintle' }] }));
    expect(getIdea(db, 'I-001')).toMatchObject({ title: 'Scintle', stage: 'exploring' });
    expect(allIdeas(db)).toHaveLength(1);
  });

  it('mints a new id and a link on a pivot, and closes the old idea as evolved', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    applyExtraction(db, 's', TURNS, x({
      new_ideas: [{ ref: 'new:1', title: 'Velocity tracker', problem: 'teams cannot see velocity', seq: 3, quote: 'track sprint velocity', confidence: 0.8 }],
      events: [{ idea: 'I-001', type: 'pivoted', payload: { to: 'new:1' }, confidence: 0.8, seq: 3, quote: 'forget ideas' }],
    }));
    expect(getIdea(db, 'I-001')?.stage).toBe('evolved');
    expect(linksOf(db, 'I-002')).toEqual([{ from_idea: 'I-001', to_idea: 'I-002', type: 'pivot' }]);
  });

  it('never applies a merge; it asks instead', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born, { ...born, ref: 'new:2', title: 'Other' }] }));
    applyExtraction(db, 's', TURNS, x({
      new_ideas: [{ ...born, ref: 'new:9', title: 'Combined' }],
      events: [
        { idea: 'I-001', type: 'merged', payload: { into: 'new:9' }, confidence: 0.9, seq: 0, quote: 'tracks my ideas' },
        { idea: 'I-002', type: 'merged', payload: { into: 'new:9' }, confidence: 0.9, seq: 0, quote: 'tracks my ideas' },
      ],
    }));
    expect(allIdeas(db)).toHaveLength(2);
    expect(db.prepare("SELECT kind FROM questions WHERE state = 'open'").all()).toEqual([{ kind: 'merge' }]);
  });

  it('drops events whose quote is not in the cited turn, or whose idea is unknown', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    const r = applyExtraction(db, 's', TURNS, x({ events: [
      { idea: 'I-001', type: 'decided', payload: {}, confidence: 0.9, seq: 2, quote: 'words nobody said' },
      { idea: 'I-404', type: 'decided', payload: {}, confidence: 0.9, seq: 2, quote: 'call it Scintle' },
    ] }));
    expect(r.events).toBe(0);
    expect(r.dropped).toHaveLength(2);
  });

  it('asks at most one question per session', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    const low = { idea: 'I-001', type: 'narrowed' as const, payload: { problem: 'p' }, confidence: 0.3, seq: 2, quote: 'call it Scintle' };
    applyExtraction(db, 's', TURNS, x({ events: [low, low] }));
    expect(db.prepare('SELECT COUNT(*) AS n FROM questions').get()).toEqual({ n: 1 });
  });
});

describe('ledger projection', () => {
  it('revive restores the last open stage, and a removed event stops counting', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    const ts = (m: number) => `2026-11-21T10:0${m}:00.000Z`;
    addEvent(db, { ideaId: 'I-001', type: 'planned', ts: ts(1), origin: 'user' });
    const drop = addEvent(db, { ideaId: 'I-001', type: 'dropped', ts: ts(2), origin: 'user' });
    expect(getIdea(db, 'I-001')).toMatchObject({ stage: 'dropped' });
    addEvent(db, { ideaId: 'I-001', type: 'revived', ts: ts(3), origin: 'user' });
    expect(getIdea(db, 'I-001')).toMatchObject({ stage: 'planned', closed_at: null });
    db.prepare("UPDATE events SET state = 'removed' WHERE id = ?").run(drop);
    expect(getIdea(db, 'I-001')?.stage).toBe('planned');
  });
});

describe('sanitize', () => {
  it('keeps well-formed parts and drops the rest', () => {
    const s = sanitize({ new_ideas: [{ ref: 'x' }], events: [{ idea: 'I-1', type: 'nonsense' }], question: { idea: 'I-1', kind: 'merge', text: 't' } });
    expect(s).toEqual({ new_ideas: [], events: [], question: { idea: 'I-1', kind: 'merge', text: 't' } });
  });
});

describe('self-links', () => {
  it('refuses a pivot or spawn into the same idea', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    const r = applyExtraction(db, 's', TURNS, x({ events: [{ idea: 'I-001', type: 'pivoted', payload: { to: 'I-001' }, confidence: 0.9, seq: 3, quote: 'forget ideas' }] }));
    expect(r.dropped).toEqual(['pivoted on I-001: target I-001 is itself']);
    expect(getIdea(db, 'I-001')?.stage).toBe('seed');
  });
});

describe('ended reasons', () => {
  it('records the reason on a drop, clears it on revive, and keeps "not interested" for the person only', async () => {
    const { moveStage } = await import('../server/actions.ts');
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    expect(moveStage(db, 'I-001', 'dropped', '', 'not-interested').ok).toBe(true);
    expect(getIdea(db, 'I-001')).toMatchObject({ stage: 'dropped', resolution: 'not-interested' });
    expect(moveStage(db, 'I-001', 'parked', '', 'crowded').ok).toBe(false);
    // After the drop, which moveStage stamped with the real clock: a fixed date here turned into a time bomb.
    addEvent(db, { ideaId: 'I-001', type: 'revived', ts: new Date(Date.now() + 60_000).toISOString(), origin: 'user' });
    expect(getIdea(db, 'I-001')?.resolution).toBeNull();
    applyExtraction(db, 's', TURNS, x({ events: [{ idea: 'I-001', type: 'dropped', payload: { reason: 'not-interested' }, confidence: 0.9, seq: 3, quote: 'forget ideas' }] }));
    const inferred = liveEvents(db, 'I-001').find((e) => e.type === 'dropped' && e.origin === 'inferred');
    expect(JSON.parse(inferred?.payload ?? '{}')).toMatchObject({ reason: 'other' });
  });
});

describe('is this idea back?', () => {
  it('revives a dropped idea on yes, and leaves it on no', async () => {
    const { answerQuestion, moveStage } = await import('../server/actions.ts');
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    moveStage(db, 'I-001', 'dropped', '', 'crowded');
    const ask = (): number => (db.prepare("INSERT INTO questions (idea_id, kind, payload, created_at) VALUES ('I-001', 'alive', '{}', '2026-11-25') RETURNING id").get() as { id: number }).id;
    answerQuestion(db, ask(), 'no');
    expect(getIdea(db, 'I-001')?.stage).toBe('dropped');
    answerQuestion(db, ask(), 'yes');
    expect(getIdea(db, 'I-001')?.stage).not.toBe('dropped');
  });
});

describe('one answer per idea', () => {
  it('settles every open "is it back?" question about the same idea', async () => {
    const { answerQuestion } = await import('../server/actions.ts');
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born] }));
    const ask = (): number => (db.prepare("INSERT INTO questions (idea_id, kind, payload, created_at) VALUES ('I-001', 'alive', '{}', '2026-11-25') RETURNING id").get() as { id: number }).id;
    const first = ask();
    ask();
    answerQuestion(db, first, 'no');
    expect(db.prepare("SELECT COUNT(*) AS n FROM questions WHERE state = 'open'").get()).toEqual({ n: 0 });
  });
});

describe('who said it', () => {
  it('keeps the speaker of each quote with the event', () => {
    applyExtraction(db, 's', TURNS, x({ new_ideas: [born], events: [{ idea: 'new:1', type: 'decided', payload: {}, confidence: 0.9, seq: 1, quote: 'an idea ledger' }] }));
    const [first, second] = liveEvents(db, 'I-001');
    expect(first?.quote_by).toBe('you');
    expect(second?.quote_by).toBe('claude');
  });
});
