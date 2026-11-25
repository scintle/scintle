/**
 * The one way Scintle calls a model: the user's own `claude -p` (context/decisions.md D9).
 * Trimmed to the prompt alone (no tools unless granted, no MCP, skills or user settings) and one round trip:
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

/** What a call may do: tools it has, and the permission rules that pre-approve them. Nothing else runs (dontAsk). */
export type Grant = { tools: string[]; allow: string[] };
const NONE: Grant = { tools: [], allow: [] };

/** The `claude -p` arguments for a call: no settings, MCP, slash commands or saved session; only the granted tools. */
export function modelArgs(grant: Grant, model: string): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--model', model,
    '--tools', grant.tools.join(','), '--allowed-tools', grant.allow.join(','), '--permission-mode', 'dontAsk',
    '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '', '--no-session-persistence',
    '--system-prompt', SYSTEM,
  ];
}

type Final = {
  type: 'result'; is_error?: boolean; result?: string; duration_ms?: number;
  usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
};

/** The final result line and every tool result's text from a stream-json transcript. */
export function readStream(stdout: string): { final: Final | undefined; toolResults: string[] } {
  let final: Final | undefined;
  const toolResults: string[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let d: { type?: string; message?: { content?: unknown } };
    try { d = JSON.parse(line) as typeof d; } catch { continue; }
    if (d.type === 'result') final = d as Final;
    if (d.type === 'user' && Array.isArray(d.message?.content)) {
      for (const c of d.message.content as { type?: string; content?: unknown }[]) {
        if (c.type === 'tool_result') toolResults.push(typeof c.content === 'string' ? c.content : JSON.stringify(c.content));
      }
    }
  }
  return { final, toolResults };
}

export function callModel<T>(
  prompt: string,
  schema: object,
  opts: { model?: string; timeoutMs?: number; grant?: Grant } = {},
): Promise<(ModelReply<T> & { toolResults: string[] }) | { error: string }> {
  const full = `${prompt}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`;
  if (wouldLeak(full)) return Promise.resolve({ error: 'prompt failed the redaction check' });
  const args = modelArgs(opts.grant ?? NONE, opts.model ?? process.env['SCINTLE_MODEL'] ?? 'sonnet');
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
          const { final: r, toolResults } = readStream(stdout);
          if (r === undefined) return resolve({ error: 'no reply' });
          if (r.is_error === true || typeof r.result !== 'string') return resolve({ error: r.result ?? 'no reply' });
          const u = r.usage ?? {};
          resolve({
            output: jsonIn(r.result) as T,
            durationMs: r.duration_ms ?? 0,
            inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
            outputTokens: u.output_tokens ?? 0,
            toolResults,
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
