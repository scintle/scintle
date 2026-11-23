/** Find, start and stop scintled. Used by hooks and slash commands; never throws to its caller. */

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './lib/config.ts';

type Running = { pid: number; port: number; url: string; token: string };

function info(): { pid: number; port: number } | undefined {
  try {
    return JSON.parse(readFileSync(join(dataDir(), 'server.json'), 'utf8')) as { pid: number; port: number };
  } catch {
    return undefined;
  }
}

async function healthy(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
    return r.ok;
  } catch {
    return false;
  }
}

function token(): string {
  return readFileSync(join(dataDir(), 'token'), 'utf8').trim();
}

export async function running(): Promise<Running | undefined> {
  const s = info();
  if (s === undefined || !(await healthy(s.port))) return undefined;
  return { ...s, url: `http://127.0.0.1:${s.port}`, token: token() };
}

function start(): void {
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const log = openSync(join(dataDir(), 'scintled.log'), 'a', 0o600);
  try {
    spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', join(import.meta.dirname, 'scintled.ts')], {
      detached: true,
      stdio: ['ignore', log, log],
    }).unref();
  } finally {
    closeSync(log);
  }
}

/** Start if needed and wait for it: for commands a person is waiting on. */
export async function ensure(): Promise<Running | undefined> {
  const up = await running();
  if (up !== undefined) return up;
  start();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const s = await running();
    if (s !== undefined) return s;
  }
  return undefined;
}

export async function stop(): Promise<boolean> {
  const s = info();
  if (s === undefined) return false;
  try {
    process.kill(s.pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * For hooks, which must finish well inside their timeout: post if the server is up, otherwise start it and
 * return. A missed event is harmless; the next one re-reads the whole transcript.
 */
export async function postFromHook(path: string, body: object): Promise<void> {
  const s = await running();
  if (s === undefined) return start();
  await fetch(`${s.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-scintle-token': s.token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1500),
  });
}

/** For commands a person is waiting on: start the server if needed, then post. */
export async function request(path: string, body: object = {}): Promise<unknown> {
  const s = await ensure();
  if (s === undefined) return undefined;
  const r = await fetch(`${s.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-scintle-token': s.token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
}
