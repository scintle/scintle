import { describe, expect, it } from 'vitest';
import { BUDGET_CHARS, pendingSize } from '../server/extract/segment.ts';
import { waiting } from '../server/live.ts';
import { openDb } from '../server/store/db.ts';

function db() {
  const d = openDb(':memory:');
  d.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path, started_at) VALUES ('s', 'claude-code', 'p', 'exact', '/x', '2026-11-22')").run();
  return d;
}
const turn = (d: ReturnType<typeof db>, seq: number, role: string, text: string) =>
  d.prepare('INSERT INTO turns (session_id, seq, role, text) VALUES (?, ?, ?, ?)').run('s', seq, role, text);

describe('batch trigger size', () => {
  it('counts only unread turns, and nothing when the person said nothing', () => {
    const d = db();
    turn(d, 0, 'assistant', 'x'.repeat(500));
    expect(pendingSize(d, 's')).toBe(0);
    turn(d, 1, 'user', 'an idea');
    expect(pendingSize(d, 's')).toBeGreaterThan(500);
    d.prepare("UPDATE sessions SET turns_extracted = 1 WHERE id = 's'").run();
    expect(pendingSize(d, 's')).toBe(0);
  });

  it('trims long replies the way the prompt does, so a long answer alone does not fill a batch', () => {
    const d = db();
    turn(d, 0, 'user', 'go');
    turn(d, 1, 'assistant', 'y'.repeat(BUDGET_CHARS * 2));
    expect(pendingSize(d, 's')).toBeLessThan(BUDGET_CHARS);
    expect(waiting(d)).toEqual({ sessions: 1, chars: pendingSize(d, 's'), chunks: 1 });
  });
});
