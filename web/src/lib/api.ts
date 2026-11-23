import type { ActionResult, Snapshot } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'same-origin', ...init });
  if (r.status === 401) throw new Error('Session expired. Run /scintle in Claude Code to reopen the board.');
  if (!r.ok) throw new Error(`Scintle server error (${r.status})`);
  return (await r.json()) as T;
}

export const getState = (): Promise<Snapshot> => request('/api/state');

export function post<T = ActionResult>(path: string, body: object = {}): Promise<T> {
  return request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

export type Brief = { id: number; body: string; version: number };
export type AskReply = { kind: 'select'; idea: string; text: string } | { kind: 'answer'; text: string } | { kind: 'none'; text: string };
