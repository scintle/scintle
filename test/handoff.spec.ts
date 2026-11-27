import { beforeEach, describe, expect, it } from 'vitest';
import { caughtSince, contextFor, deadEnd, hereFor, historyOf, ideaCard, matchIdeas, pickerIdeas, recordPlan, searchIdeas } from '../server/handoff.ts';
import { homedir } from 'node:os';
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

describe('dead ends', () => {
  it('tags what was dropped in the history, and answers only for a dropped approach or idea', async () => {
    const { moveStage } = await import('../server/actions.ts');
    const tried = addEvent(db, { ideaId: 'I-001', type: 'tried', ts: '2026-11-03T10:00:00.000Z', origin: 'user', payload: { approach: 'a Slack bot', outcome: 'dropped', why: 'nobody answered after day two' } });
    const kept = addEvent(db, { ideaId: 'I-001', type: 'tried', ts: '2026-11-04T10:00:00.000Z', origin: 'user', payload: { approach: 'an email digest', outcome: 'kept' } });
    const decided = addEvent(db, { ideaId: 'I-001', type: 'decided', ts: '2026-11-05T10:00:00.000Z', origin: 'user', payload: { decision: 'Fridays' } });
    const h = historyOf(db, 'I-001') ?? '';
    expect(h).toContain(`[#${tried}]`);
    expect(h).not.toContain(`[#${kept}]`);
    expect(h).toContain('flag_dead_end');
    expect(deadEnd(db, tried)).toMatchObject({ ideaId: 'I-001', what: 'a Slack bot', why: 'nobody answered after day two', day: '2026-11-03' });
    expect(deadEnd(db, kept)).toBeUndefined();
    expect(deadEnd(db, decided)).toBeUndefined();
    expect(deadEnd(db, 99_999)).toBeUndefined();
    moveStage(db, 'I-002', 'dropped', '', 'crowded');
    const drop = (db.prepare("SELECT id FROM events WHERE idea_id = 'I-002' AND type = 'dropped'").get() as { id: number }).id;
    expect(deadEnd(db, drop)).toMatchObject({ ideaId: 'I-002', what: 'Chord change trainer', why: 'crowded market' });
    // A history with nothing dropped carries no instruction.
    expect(historyOf(db, 'I-003')).not.toContain('flag_dead_end');
  });

  it('keeps the /scintle:plan brief free of ids', async () => {
    const { buildBrief } = await import('../server/brief.ts');
    addEvent(db, { ideaId: 'I-001', type: 'tried', ts: '2026-11-03T10:00:00.000Z', origin: 'user', payload: { approach: 'a Slack bot', outcome: 'dropped' } });
    expect(buildBrief(db, 'I-001')?.body).not.toMatch(/\[#\d+\]/);
  });
});

describe('the plan picker', () => {
  it('lists open ideas before closed ones, each with its latest step', async () => {
    const { moveStage } = await import('../server/actions.ts');
    moveStage(db, 'I-001', 'dropped', '', 'crowded');
    const list = pickerIdeas(db);
    expect(list.at(-1)).toMatchObject({ id: 'I-001', stage: 'dropped', last: 'dropped' });
    expect(list.slice(0, -1).every((i) => i.stage !== 'dropped')).toBe(true);
  });
});

describe('where you left off', () => {
  const session = (id: string, cwd: string, harness = 'claude-code') =>
    db.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path, started_at, cwd) VALUES (?, ?, 'p', 'exact', '/x', '2026-11-01T00:00:00Z', ?)").run(id, harness, cwd);
  const ev = (idea: string, sid: string, ts: string) =>
    addEvent(db, { ideaId: idea, type: 'decided', ts, origin: 'inferred', confidence: 0.9, payload: { decision: `call ${idea}` }, sessionId: sid });

  it('gives a folder to the idea that owns it, even through redacted "~" paths, and "last here" in a shared folder', () => {
    session('s1', '~/code/trailwatch');
    session('s2', '~/code');
    for (const t of ['2026-11-02', '2026-11-03']) ev('I-001', 's1', `${t}T10:00:00.000Z`);
    ev('I-002', 's2', '2026-11-05T10:00:00.000Z');
    ev('I-003', 's2', '2026-11-06T10:00:00.000Z');
    expect(hereFor(db, `${homedir()}/code/trailwatch`)).toMatchObject({ idea: { id: 'I-001', step: 'decided', detail: 'call I-001' }, others: 0 });
    expect(hereFor(db, `${homedir()}/code`)).toMatchObject({ idea: { id: 'I-003' }, others: 2 });
    expect(hereFor(db, homedir())).toEqual({ idea: null, others: 0 });
    expect(hereFor(db, '/elsewhere')).toEqual({ idea: null, others: 0 });
  });
});

describe('plans approved in plan mode', () => {
  const planned = (id: string) => db.prepare("SELECT payload, excerpt, origin FROM events WHERE type = 'planned' AND idea_id = ?").all(id) as { payload: string; excerpt: string; origin: string }[];

  it('records a plan on the idea its marker names, once per session, with secrets redacted', () => {
    const plan = '<!-- scintle:idea=I-002@v3 -->\n# Ship the chord drills\nUse token ghp_Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe9Dc8B for the API.';
    expect(recordPlan(db, 's1', plan)).toEqual({ id: 'I-002', title: 'Chord change trainer' });
    expect(recordPlan(db, 's1', plan)).toEqual({ id: 'I-002', title: 'Chord change trainer' });
    const rows = planned('I-002');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.payload ?? '{}')).toEqual({ plan: 'Ship the chord drills', briefVersion: 3 });
    expect(rows[0]?.excerpt).not.toContain('ghp_');
  });

  it('records a plan that names exactly one idea, and nothing for one that names none or several', () => {
    expect(recordPlan(db, 's2', '# Plan\nBuild the trailwatch alert poller first.')).toMatchObject({ id: 'I-001' });
    expect(recordPlan(db, 's3', '# Plan\nRefactor the settings page.')).toBeUndefined();
    expect(recordPlan(db, 's4', '# Plan\nMerge trailwatch into the async status digest.')).toBeUndefined();
  });
});

describe('what reading caught', () => {
  it('lists inferred events recorded since a time, optionally for one session', () => {
    const at = (iso: string, id: number) => db.prepare('UPDATE events SET created_at = ? WHERE id = ?').run(iso, id);
    const a = addEvent(db, { ideaId: 'I-001', type: 'decided', ts: '2026-11-10T10:00:00.000Z', origin: 'inferred', confidence: 0.9, payload: { decision: 'Fridays' }, sessionId: 'sA' });
    const b = addEvent(db, { ideaId: 'I-002', type: 'tried', ts: '2026-11-10T10:00:00.000Z', origin: 'inferred', confidence: 0.9, payload: { approach: 'a metronome', outcome: 'kept' }, sessionId: 'sB' });
    const c = addEvent(db, { ideaId: 'I-002', type: 'decided', ts: '2026-11-10T10:00:00.000Z', origin: 'user', payload: { decision: 'by hand' }, sessionId: 'sB' });
    at('2026-11-10T10:00:00.000Z', a); at('2026-11-10T11:00:00.000Z', b); at('2026-11-10T11:00:00.000Z', c);
    expect(caughtSince(db, '2026-11-10T09:00:00.000Z').map((x) => x.id)).toEqual(['I-001', 'I-002']);
    expect(caughtSince(db, '2026-11-10T10:30:00.000Z')).toMatchObject([{ id: 'I-002', title: 'Chord change trainer', type: 'tried', detail: 'a metronome', event: expect.any(Number) }]);
    expect(caughtSince(db, '2026-11-10T09:00:00.000Z', 'sA').map((x) => x.id)).toEqual(['I-001']);
  });
});
