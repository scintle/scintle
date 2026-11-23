/** ⌘K fallback: one model call over idea titles and stages; returns an idea to open or a short answer. */

import { callModel } from './lib/model.ts';
import { redactFully } from './lib/text.ts';
import type { Db } from './store/db.ts';
import { recordCall } from './store/upkeep.ts';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'idea', 'text'],
  properties: { kind: { type: 'string', enum: ['select', 'answer', 'none'] }, idea: { type: 'string' }, text: { type: 'string' } },
} as const;

type Reply = { kind: 'select' | 'answer' | 'none'; idea: string; text: string };

export async function ask(db: Db, q: string): Promise<Reply> {
  const ideas = db.prepare('SELECT id, title, problem, stage, updated_at FROM ideas ORDER BY updated_at DESC LIMIT 200').all() as {
    id: string; title: string; problem: string; stage: string; updated_at: string;
  }[];
  const list = ideas.map((i) => `${i.id} "${i.title}" [${i.stage}, ${i.updated_at.slice(0, 10)}]: ${i.problem}`).join('\n');
  const prompt = redactFully(`A builder asks their idea board: "${q}"
Ideas:
${list}

If one idea answers it, return kind "select" with its id and one sentence why. If the question needs a short
answer across ideas, return kind "answer" with at most two sentences and idea "". Otherwise kind "none".`);
  const r = await callModel<Reply>(prompt, SCHEMA, { timeoutMs: 60_000 });
  recordCall(db, 'ask', r);
  if ('error' in r) return { kind: 'none', idea: '', text: `Couldn't ask Claude: ${r.error}` };
  if (r.output.kind === 'select' && !ideas.some((i) => i.id === r.output.idea)) return { kind: 'none', idea: '', text: r.output.text };
  return r.output;
}
