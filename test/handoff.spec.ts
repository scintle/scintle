import { beforeEach, describe, expect, it } from 'vitest';
import { contextFor, historyOf, ideaCard, matchIdeas, searchIdeas } from '../server/handoff.ts';
import { openDb, type Db } from '../server/store/db.ts';
import { addEvent, addLink, createIdea } from '../server/store/ledger.ts';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  const born = { ts: '2026-11-01T10:00:00.000Z', origin: 'user' as const };
  createIdea(db, 'trailwatch', 'agents go wrong unseen', born);
  createIdea(db, 'Chord change trainer', 'guitar learners stall on chord changes', born);
  const old = createIdea(db, 'Async status digest', 'managers cannot see progress', born);
  addEvent(db, { ideaId: old, type: 'renamed', ts: '2026-11-02T10:00:00.000Z', origin: 'user', payload: { from: 'Async status digest', to: 'Weekly Pulse' } });
  createIdea(db, 'Notes', 'a short single-word title', born);
});

describe('matching ideas in a prompt', () => {
  it('matches a name or ID, a former title, and not a short single word', () => {
    expect(matchIdeas(db, 'what were the risks in trailwatch?')).toEqual(['I-001']);
    expect(matchIdeas(db, 'back to the async status digest')).toEqual(['I-003']);
    expect(matchIdeas(db, 'see I-002')).toEqual(['I-002']);
    expect(matchIdeas(db, 'take notes on this')).toEqual([]);
  });

  it('ignores a name that appears only inside a path or URL', () => {
    expect(matchIdeas(db, 'read ~/Workspace/trailwatch/DECISIONS.md and summarise it')).toEqual([]);
    expect(matchIdeas(db, 'see https://github.com/trailwatch/trailwatch')).toEqual([]);
    expect(matchIdeas(db, 'in trailwatch, read ~/Workspace/trailwatch/README.md')).toEqual(['I-001']);
  });

  it('skips an ID quoted as an example, but not a quoted title', () => {
    expect(matchIdeas(db, '"puts /scintle:plan I-002 in the prompt box" - which box?')).toEqual([]);
    expect(matchIdeas(db, 'run `/scintle:plan I-002` later')).toEqual([]);
    expect(matchIdeas(db, 'what about the “Chord change trainer” idea?')).toEqual(['I-002']);
  });

  it('attaches a pointer, never the brief', () => {
    const c = contextFor(db, 'how is trailwatch doing?').context;
    expect(c).toContain('idea_history');
    expect(c).toContain('I-001');
    expect(c).not.toContain('agents go wrong unseen');
  });
});

describe('the search tool and history', () => {
  it('finds ideas by topic words, best first', () => {
    expect(searchIdeas(db, 'guitar chord drills').ideas[0]?.id).toBe('I-002');
    expect(searchIdeas(db, '').total).toBe(4);
  });

  it('gives history without the plan request', () => {
    const h = historyOf(db, 'I-002') ?? '';
    expect(h).toContain('Chord change trainer');
    expect(h).not.toMatch(/## Ask|scintle:idea=/);
  });
});

describe('the companion pane card', () => {
  it('gives every live moment oldest first, former names, and linked ideas by name', () => {
    const spun = createIdea(db, 'Weekly Pulse email', 'a digest by email', { ts: '2026-11-03T10:00:00.000Z', origin: 'user' });
    const ev = addEvent(db, { ideaId: 'I-003', type: 'spawned', ts: '2026-11-03T10:00:00.000Z', origin: 'user', payload: { to: spun } });
    addLink(db, 'I-003', spun, 'spawn', ev);
    const c = ideaCard(db, 'I-003');
    expect(c?.events.map((e) => e.type)).toEqual(['born', 'renamed', 'spawned']);
    expect(c?.formerly).toEqual(['Async status digest']);
    expect(c?.to).toEqual([{ id: spun, title: 'Weekly Pulse email', stage: 'seed', type: 'spawn' }]);
    expect(c?.events[2]?.payload['toTitle']).toBe('Weekly Pulse email');
    expect(ideaCard(db, 'I-999')).toBeUndefined();
  });
});

describe('the brief Claude reads', () => {
  it('says how an idea ended, with the reason and the person\'s own why', async () => {
    const { moveStage } = await import('../server/actions.ts');
    moveStage(db, 'I-002', 'dropped', 'no time for guitar projects this year', 'not-interested');
    expect(historyOf(db, 'I-002')).toMatch(/## Lifecycle\n- \d{4}-\d\d-\d\d dropped \(not interested\): no time for guitar projects this year/);
  });
});
