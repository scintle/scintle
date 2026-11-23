import { describe, expect, it } from 'vitest';
import { parseClaudeCode } from '../server/ingest/parsers/claude-code.ts';
import { parse } from '../server/ingest/parsers/index.ts';
import { redact } from '../server/lib/redact.ts';

const TS = '2026-11-20T10:00:00.000Z';
let n = 0;
const rec = (o: Record<string, unknown>, parent: string | null = null): string =>
  JSON.stringify({ uuid: o['uuid'] ?? `u${n++}`, parentUuid: parent, sessionId: 's1', timestamp: TS, version: '2.1.330', cwd: '/w/app', ...o });
const user = (uuid: string, content: unknown, parent: string | null = null, extra = {}) =>
  rec({ uuid, type: 'user', message: { role: 'user', content }, ...extra }, parent);
const asst = (uuid: string, content: unknown[], parent: string | null) =>
  rec({ uuid, type: 'assistant', message: { role: 'assistant', content } }, parent);

describe('parseClaudeCode', () => {
  it('keeps prompts, answers, commands and written files; drops harness echoes', () => {
    const lines = [
      user('a', 'Track my ideas across sessions'),
      asst('b', [{ type: 'text', text: 'Sounds like a ledger.' }, { type: 'tool_use', name: 'Write', input: { file_path: '/w/app/spec.md' } }], 'a'),
      user('c', [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }], 'b'),
      user('d', '<system-reminder>noise</system-reminder>', 'c'),
      user('e', '<command-name>/plan</command-name><command-args>I-001</command-args>', 'd'),
      user('f', 'command output', 'e', { isMeta: true }),
    ];
    const s = parseClaudeCode(lines, 'x');
    expect(s.sessionId).toBe('s1');
    expect(s.version).toBe('2.1.330');
    expect(s.turns.map((t) => [t.role, t.text])).toEqual([
      ['user', 'Track my ideas across sessions'],
      ['assistant', 'Sounds like a ledger.'],
      ['command', '/plan I-001'],
    ]);
    expect(s.turns[1]?.filesWritten).toEqual(['/w/app/spec.md']);
  });

  it('attaches a write with no preceding text to an assistant turn', () => {
    const s = parseClaudeCode([user('a', 'go'), asst('b', [{ type: 'tool_use', name: 'Edit', input: { file_path: '/w/x.ts' } }], 'a')], 'x');
    expect(s.turns[1]).toMatchObject({ role: 'assistant', text: '', filesWritten: ['/w/x.ts'] });
  });

  it('drops rewound branches and sidechains but keeps seq stable', () => {
    const lines = [
      user('a', 'first'),
      user('b', 'abandoned idea', 'a'),
      user('c', 'kept idea', 'a'),
      rec({ uuid: 'd', type: 'user', isSidechain: true, message: { content: 'subagent prompt' } }, 'c'),
      asst('e', [{ type: 'text', text: 'reply' }], 'c'),
    ];
    const s = parseClaudeCode(lines, 'x');
    expect(s.turns.map((t) => [t.seq, t.text])).toEqual([[0, 'first'], [2, 'kept idea'], [4, 'reply']]);
    expect(s.stats).toMatchObject({ abandoned: 1, sidechain: 1 });
  });

  it('redacts text before it is stored', () => {
    const s = parseClaudeCode([user('a', 'key is sk-ant-api03-AbCdEf1234567890xyzAbCdEf ok')], 'x');
    const text = s.turns[0]?.text ?? '';
    expect(text).not.toContain('sk-ant-api03');
    expect(redact(text).text).toBe(text);
  });

  it('counts malformed lines and unknown record types instead of throwing', () => {
    const s = parseClaudeCode(['{not json', rec({ type: 'brand-new-type' }), user('a', 'hi')], 'x');
    expect(s.stats.malformed).toBe(1);
    expect(s.stats.unknown).toEqual({ 'brand-new-type': 1 });
    expect(s.turns).toHaveLength(1);
  });
});

describe('parse (registry)', () => {
  it('reports exact, range and none matches', () => {
    const at = (v: string) => parse('/h/.claude/projects/p/s.jsonl', JSON.stringify({ parentUuid: null, version: v, type: 'user', message: { content: 'x' } }), 's');
    expect(at('2.1.330').match).toBe('exact');
    expect(at('2.1.999').match).toBe('range');
    expect(parse('/h/.codex/sessions/s.jsonl', '{}', 's').match).toBe('none');
  });
});

describe('ship commands', () => {
  it('keeps release commands as [ran] lines and skips dry runs and other commands', () => {
    const bash = (uuid: string, command: string, parent: string) => asst(uuid, [{ type: 'tool_use', name: 'Bash', input: { command } }], parent);
    const s = parseClaudeCode([
      user('a', 'ship it'),
      bash('b', 'cd repo && gh release create v0.1.0 dist.zip', 'a'),
      bash('c', 'npm publish --dry-run', 'b'),
      bash('d', 'ls -la', 'c'),
      bash('e', 'npm publish --tag latest --access public', 'd'),
    ], 'x');
    expect(s.turns.filter((t) => t.role === 'assistant').map((t) => t.text)).toEqual([
      '[ran] cd repo && gh release create v0.1.0 dist.zip',
      '[ran] npm publish --tag latest --access public',
    ]);
  });
});
