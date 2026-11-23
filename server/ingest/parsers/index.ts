/**
 * Picks a parser per transcript by harness and version, and reports how well it matched.
 * Registry shape adapted from vibesenpai (see NOTICE).
 */

import type { ParsedSession } from '../skeleton.ts';
import { parseClaudeCode } from './claude-code.ts';

type Harness = 'claude-code' | 'codex' | 'unknown';
type Match = 'exact' | 'range' | 'fallback' | 'none';

type TranscriptParser = {
  id: string;
  harness: Harness;
  /** Versions checked against real records. */
  tested: readonly string[];
  range: RegExp;
  parse(lines: readonly string[], sessionId: string): ParsedSession;
};

export type ParseResult = ParsedSession & { harness: Harness; parser: string; match: Match };

const PARSERS: readonly TranscriptParser[] = [
  {
    id: 'claude-code/2.1.x',
    harness: 'claude-code',
    tested: ['2.1.201', '2.1.241', '2.1.296', '2.1.299', '2.1.330'],
    range: /^2\.1\./,
    parse: parseClaudeCode,
  },
];

const CODEX_TYPES = new Set(['session_meta', 'response_item', 'event_msg', 'turn_context']);

function detectHarness(path: string, lines: readonly string[]): Harness {
  if (path.includes('.claude/projects')) return 'claude-code';
  if (path.includes('.codex/sessions')) return 'codex';
  for (const line of lines.slice(0, 50)) {
    try {
      const r = JSON.parse(line) as Record<string, unknown>;
      if (typeof r['type'] === 'string' && CODEX_TYPES.has(r['type'])) return 'codex';
      if ('parentUuid' in r) return 'claude-code';
    } catch {
      // Not JSON; keep looking.
    }
  }
  return 'unknown';
}

function detectVersion(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    if (!line.includes('"version"')) continue;
    try {
      const v = (JSON.parse(line) as { version?: unknown }).version;
      if (typeof v === 'string' && v !== '') return v;
    } catch {
      // Keep scanning.
    }
  }
  return undefined;
}

export function parse(path: string, text: string, sessionId: string): ParseResult {
  const lines = text.split('\n');
  const harness = detectHarness(path, lines);
  const version = detectVersion(lines);
  const own = PARSERS.filter((p) => p.harness === harness);

  let parser = version === undefined ? undefined : own.find((p) => p.tested.includes(version));
  let match: Match = 'exact';
  if (parser === undefined && version !== undefined) {
    parser = own.find((p) => p.range.test(version));
    match = 'range';
  }
  if (parser === undefined) {
    parser = own[0];
    match = 'fallback';
  }
  if (parser === undefined) {
    return {
      sessionId,
      turns: [],
      stats: { lines: lines.length, malformed: 0, unknown: { [`unsupported:${harness}`]: 1 }, abandoned: 0, sidechain: 0 },
      harness,
      parser: 'none',
      match: 'none',
    };
  }
  return { ...parser.parse(lines, sessionId), harness, parser: parser.id, match };
}
