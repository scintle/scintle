import { describe, expect, it } from 'vitest';
import { parseClaudeCode } from '../server/ingest/parsers/claude-code.ts';
import { linkPlans } from '../server/returnpath.ts';
import { openDb } from '../server/store/db.ts';
import { createIdea, liveEvents } from '../server/store/ledger.ts';

const TS = '2026-11-22T10:00:00.000Z';
const line = (o: object): string => JSON.stringify({ sessionId: 's', timestamp: TS, parentUuid: null, ...o });

function setup(lines: string[]) {
  const db = openDb(':memory:');
  createIdea(db, 'Scintle', 'ideas outlive chats', { ts: TS, origin: 'user' });
  db.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path) VALUES ('s', 'claude-code', 'p', 'exact', '/x')").run();
  const put = db.prepare('INSERT INTO turns (session_id, seq, ts, role, text) VALUES (?, ?, ?, ?, ?)');
  for (const t of parseClaudeCode(lines, 's').turns) put.run('s', t.seq, t.ts ?? null, t.role, t.text);
  return db;
}

describe('return path', () => {
  it('links a plan-mode plan carrying the brief marker, once', () => {
    const db = setup([
      line({ uuid: 'a', type: 'user', message: { content: 'plan it' } }),
      line({ uuid: 'b', parentUuid: 'a', type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'ExitPlanMode', input: { plan: '# Build the board\nscintle:idea=I-001@v3\n- step' } },
      ] } }),
    ]);
    expect(linkPlans(db, 's')).toBe(1);
    expect(linkPlans(db, 's')).toBe(0);
    const planned = liveEvents(db, 'I-001').find((e) => e.type === 'planned');
    expect(JSON.parse(planned?.payload ?? '{}')).toEqual({ plan: 'Build the board', briefVersion: 3 });
  });

  it('falls back to the /scintle:plan command when the marker was dropped', () => {
    const db = setup([
      line({ uuid: 'a', type: 'user', message: { content: '<command-name>/scintle:plan</command-name><command-args>I-001</command-args>' } }),
      line({ uuid: 'b', parentUuid: 'a', type: 'assistant', message: { content: [{ type: 'tool_use', name: 'ExitPlanMode', input: { plan: 'Plan without marker' } }] } }),
    ]);
    expect(linkPlans(db, 's')).toBe(1);
  });
});

describe('return path without plan mode', () => {
  it('takes the longest reply to /scintle:plan before the next prompt', () => {
    const long = `# Trail alerts plan\n${'- a step that matters\n'.repeat(30)}`;
    const db = setup([
      line({ uuid: 'a', type: 'user', message: { content: '<command-name>/scintle:plan</command-name><command-args>I-001</command-args>' } }),
      line({ uuid: 'b', parentUuid: 'a', type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the brief.' }] } }),
      line({ uuid: 'c', parentUuid: 'b', type: 'assistant', message: { content: [{ type: 'text', text: long }] } }),
      line({ uuid: 'd', parentUuid: 'c', type: 'user', message: { content: 'thanks' } }),
      line({ uuid: 'e', parentUuid: 'd', type: 'assistant', message: { content: [{ type: 'text', text: long + long }] } }),
    ]);
    expect(linkPlans(db, 's')).toBe(1);
    const planned = liveEvents(db, 'I-001').find((e) => e.type === 'planned');
    expect(JSON.parse(planned?.payload ?? '{}')).toMatchObject({ plan: 'Trail alerts plan' });
  });
});

describe('older plan mode', () => {
  it('reads the plan from the ExitPlanMode result when the call carries none', () => {
    const db = setup([
      line({ uuid: 'a', type: 'user', message: { content: '<command-name>/scintle:plan</command-name><command-args>I-001</command-args>' } }),
      line({ uuid: 'b', parentUuid: 'a', type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'ExitPlanMode', input: {} }] } }),
      line({ uuid: 'c', parentUuid: 'b', type: 'user', toolUseResult: { plan: '# Old-style plan\nscintle:idea=I-001@v2' }, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'approved' }] } }),
    ]);
    expect(linkPlans(db, 's')).toBe(1);
    const planned = liveEvents(db, 'I-001').find((e) => e.type === 'planned');
    expect(JSON.parse(planned?.payload ?? '{}')).toEqual({ plan: 'Old-style plan', briefVersion: 2 });
  });
});
