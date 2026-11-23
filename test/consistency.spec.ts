import { describe, expect, it } from 'vitest';
import { applyExtraction } from '../server/extract/apply.ts';
import { buildPrompt } from '../server/extract/prompt.ts';
import { extractAll } from '../server/extract/run.ts';
import { openDb, type Db } from '../server/store/db.ts';
import { addEvent, createIdea, getIdea, liveEvents, resetInferred } from '../server/store/ledger.ts';

function setup(): Db {
  const db = openDb(':memory:');
  const s = db.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path, started_at) VALUES (?, 'claude-code', 'p', 'exact', '/x', ?)");
  s.run('A', '2026-11-20T09:00:00Z');
  s.run('B', '2026-11-20T08:00:00Z');
  return db;
}
const turn = (db: Db, session: string, seq: number, ts: string, role: string, text: string) =>
  db.prepare('INSERT INTO turns (session_id, seq, ts, role, text) VALUES (?, ?, ?, ?, ?)').run(session, seq, ts, role, text);
const ok = (output: unknown) => Promise.resolve({ output, durationMs: 0, inputTokens: 0, outputTokens: 0 });
const none = { new_ideas: [], events: [], question: null };

describe('idea IDs', () => {
  it('are never reused after the highest idea is deleted', () => {
    const db = setup();
    createIdea(db, 'one', '', { ts: '2026-11-20T10:00:00Z', origin: 'user' });
    const two = createIdea(db, 'two', '', { ts: '2026-11-20T10:01:00Z', origin: 'user' });
    db.prepare('DELETE FROM events WHERE idea_id = ?').run(two);
    db.prepare('DELETE FROM ideas WHERE id = ?').run(two);
    expect(createIdea(db, 'three', '', { ts: '2026-11-20T10:02:00Z', origin: 'user' })).toBe('I-003');
  });

  it('survive a fresh re-read when the idea is born at nearly the same turn', () => {
    const db = setup();
    const first = createIdea(db, 'Scintle', 'ideas outlive chats', { ts: '2026-11-20T10:00:00Z', origin: 'inferred', sessionId: 'A', turnSeq: 5 });
    createIdea(db, 'Other', '', { ts: '2026-11-20T10:05:00Z', origin: 'inferred', sessionId: 'A', turnSeq: 40 });
    resetInferred(db);
    expect(getIdea(db, first)).toBeUndefined();
    const again = createIdea(db, 'Idea ledger', 'ideas outlive chats', { ts: '2026-11-20T10:00:00Z', origin: 'inferred', sessionId: 'A', turnSeq: 7 });
    expect(again).toBe(first);
    expect(createIdea(db, 'Brand new', '', { ts: '2026-11-20T11:00:00Z', origin: 'inferred', sessionId: 'B', turnSeq: 5 })).toBe('I-003');
  });
});

describe('fresh re-read keeps what the person did', () => {
  it('drops inferred events but keeps corrections, stage moves and hand-made ideas', () => {
    const db = setup();
    const inferred = createIdea(db, 'Scintle', '', { ts: '2026-11-20T10:00:00Z', origin: 'inferred', sessionId: 'A', turnSeq: 1 });
    const guess = addEvent(db, { ideaId: inferred, type: 'decided', ts: '2026-11-20T10:10:00Z', origin: 'inferred', payload: { decision: 'x' } });
    addEvent(db, { ideaId: inferred, type: 'tried', ts: '2026-11-20T10:10:00Z', origin: 'user', supersedes: guess, payload: { approach: 'y' } });
    addEvent(db, { ideaId: inferred, type: 'parked', ts: '2026-11-20T11:00:00Z', origin: 'user' });
    const mine = createIdea(db, 'Mine', '', { ts: '2026-11-20T12:00:00Z', origin: 'user' });
    resetInferred(db);
    expect(liveEvents(db, inferred).map((e) => e.type)).toEqual(['tried', 'parked']);
    expect(getIdea(db, mine)?.title).toBe('Mine');
    const back = createIdea(db, 'Scintle', '', { ts: '2026-11-20T10:00:00Z', origin: 'inferred', sessionId: 'A', turnSeq: 1 });
    expect(back).toBe(inferred);
    expect(getIdea(db, inferred)?.stage).toBe('parked');
  });
});

describe('global time order', () => {
  it('reads segments across sessions by time, and a failure holds back only that session', async () => {
    const db = setup();
    turn(db, 'A', 0, '2026-11-20T10:00:00Z', 'user', 'alpha one');
    turn(db, 'B', 0, '2026-11-20T09:00:00Z', 'user', 'bravo one');
    const order: string[] = [];
    await extractAll(db, ['A', 'B'], {
      call: (p) => { order.push(p.includes('bravo one') ? 'B' : 'A'); return order.length === 1 ? Promise.resolve({ error: 'boom' }) : ok(none); },
    });
    expect(order).toEqual(['B', 'A']);
    const cursor = (id: string) => (db.prepare('SELECT turns_extracted AS n FROM sessions WHERE id = ?').get(id) as { n: number }).n;
    expect(cursor('B')).toBe(-1);
    expect(cursor('A')).toBe(0);
  });
});

describe('segment overlap', () => {
  it('shows the turns just before a segment as context the model may not cite', () => {
    const db = setup();
    turn(db, 'A', 0, '2026-11-20T10:00:00Z', 'user', 'we were calling it the ledger');
    turn(db, 'A', 1, '2026-11-20T10:01:00Z', 'user', 'now call it Scintle');
    const p = buildPrompt(db, null, [{ seq: 1, ts: null, role: 'user', text: 'now call it Scintle', files: [] }], 'A');
    expect(p).toContain('Just before this slice');
    expect(p).toContain('we were calling it the ledger');
    const r = applyExtraction(db, 'A', [{ seq: 1, ts: null, role: 'user', text: 'now call it Scintle', files: [] }], {
      new_ideas: [{ ref: 'new:1', title: 'Ledger', problem: '', seq: 0, quote: 'calling it the ledger', confidence: 0.9 }], events: [], question: null,
    });
    expect(r.ideas).toBe(0);
  });
});
