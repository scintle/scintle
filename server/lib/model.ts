/**
 * The one way Scintle calls a model: the user's own `claude -p` (context/decisions.md D9).
 * Trimmed to the prompt alone (no default tools, MCP, skills or user settings) and one round trip:
 * the schema goes in the prompt and the reply is checked here (D17).
 */

import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redact } from './redact.ts';

export type ModelReply<T> = { output: T; durationMs: number; inputTokens: number; outputTokens: number };

const SYSTEM = 'You are a careful analyst for a local tool. Reply with one JSON object only: no prose, no code fence.';

function runDir(): string {
  const dir = join(tmpdir(), 'scintle-run');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Text redaction would still change must not leave the machine. */
function wouldLeak(text: string): boolean {
  return redact(text).text !== text;
}

/** The JSON object in a reply, tolerating a stray code fence. */
function jsonIn(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('no JSON object in reply');
  return JSON.parse(text.slice(start, end + 1));
}

export function callModel<T>(
  prompt: string,
  schema: object,
  opts: { model?: string; timeoutMs?: number; tools?: string } = {},
): Promise<ModelReply<T> | { error: string }> {
  const full = `${prompt}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`;
  if (wouldLeak(full)) return Promise.resolve({ error: 'prompt failed the redaction check' });
  const tools = opts.tools ?? '';
  const args = [
    '-p', '--output-format', 'json', '--model', opts.model ?? process.env['SCINTLE_MODEL'] ?? 'sonnet',
    '--tools', tools, '--allowed-tools', tools,
    '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '', '--no-session-persistence',
    '--system-prompt', SYSTEM,
  ];
  return new Promise((resolve) => {
    const child = execFile(
      'claude',
      args,
      {
        cwd: runDir(),
        timeout: opts.timeoutMs ?? 300_000,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, SCINTLE_DISABLE: '1', VIBESENPAI_DISABLE: '1' },
      },
      (err, stdout) => {
        if (err !== null) return resolve({ error: err.message.split('\n')[0] ?? 'claude -p failed' });
        try {
          const r = JSON.parse(stdout) as {
            is_error?: boolean; result?: string; duration_ms?: number;
            usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
          };
          if (r.is_error === true || typeof r.result !== 'string') return resolve({ error: r.result ?? 'no reply' });
          const u = r.usage ?? {};
          resolve({
            output: jsonIn(r.result) as T,
            durationMs: r.duration_ms ?? 0,
            inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
            outputTokens: u.output_tokens ?? 0,
          });
        } catch (e) {
          resolve({ error: `unreadable reply: ${(e as Error).message}` });
        }
      },
    );
    // The prompt goes on stdin; it must be closed or the CLI waits for the timeout.
    child.stdin?.end(full);
  });
}
