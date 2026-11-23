/**
 * Claude Code 2.1.x transcript → skeleton turns. Record handling adapted from vibesenpai's parser
 * (see NOTICE); only what idea extraction needs is kept (context/decisions.md D11).
 */

import { clean, isPlausibleTimestamp } from '../../lib/text.ts';
import type { ParsedSession, ParseStats, Turn } from '../skeleton.ts';

/** Harness echoes inside `user` records: not the person speaking. */
const META_CONTENT =
  /^\s*<(local-command-(caveat|stdout|stderr)|command-name|command-message|command-args|system-reminder|task-notification)\b/;

const NOISE_TYPES = new Set([
  'attachment', 'last-prompt', 'mode', 'permission-mode', 'atis-latch', 'ai-title', 'agent-name',
  'progress', 'frame-link', 'system', 'queue-operation', 'file-history-snapshot', 'file-history-delta',
  'summary', 'cost-state', 'pr-link',
]);

/** Marks an assistant turn that is a plan the user was shown in plan mode. */
export const PLAN_PREFIX = '[plan]\n';

/** Commands that put work in users' hands; shown to extraction as `[ran]` lines. Dry runs excluded. */
const SHIP_COMMAND = /\b(gh release create|npm publish|pnpm publish|yarn npm publish|git tag v?\d|git push\b[^\n]*--tags|vercel[^\n]*--prod|netlify deploy[^\n]*--prod|fly deploy|wrangler deploy)\b/;

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

type Block = { type?: string; text?: string; name?: string; id?: string; tool_use_id?: string; input?: Record<string, unknown> };

type RawRecord = {
  type?: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  cwd?: string;
  version?: string;
  message?: { content?: string | Block[] };
  /** Older plan mode puts the plan here, on the ExitPlanMode result, instead of in the call's input. */
  toolUseResult?: { plan?: unknown };
};

type Node = { uuid: string; parent: string | null; humanPrompt: boolean; sidechain: boolean };

/** `/name args` from a slash-command echo, else undefined. */
function slashCommand(text: string): string | undefined {
  const name = /<command-name>\s*(\/?[^<\s]+)\s*<\/command-name>/.exec(text)?.[1];
  if (name === undefined) return undefined;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim() ?? '';
  return `${name.startsWith('/') ? name : `/${name}`}${args === '' ? '' : ` ${args}`}`;
}

/** Records on a branch the user rewound away from: an off-spine subtree holding a human prompt. */
function abandonedUuids(nodes: Node[]): Set<string> {
  const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
  const kids = new Map<string, Node[]>();
  for (const n of nodes) {
    const k = n.parent ?? '';
    kids.set(k, [...(kids.get(k) ?? []), n]);
  }

  const spine = new Set<string>();
  for (let cur = nodes.at(-1)?.uuid; cur !== undefined && !spine.has(cur); ) {
    spine.add(cur);
    const p = byUuid.get(cur)?.parent;
    cur = p === null || p === undefined || !byUuid.has(p) ? undefined : p;
  }

  const subtree = (root: string): string[] => {
    const out: string[] = [];
    const stack = [root];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const u = stack.pop() as string;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      for (const c of kids.get(u) ?? []) stack.push(c.uuid);
    }
    return out;
  };

  const dead = new Set<string>();
  for (const s of spine) {
    for (const child of kids.get(s) ?? []) {
      if (spine.has(child.uuid) || child.sidechain) continue;
      const sub = subtree(child.uuid);
      if (sub.some((u) => byUuid.get(u)?.humanPrompt === true)) for (const u of sub) dead.add(u);
    }
  }
  return dead;
}

type Candidate = { uuid: string | undefined; sidechain: boolean; turn: Omit<Turn, 'seq'> };

export function parseClaudeCode(lines: readonly string[], fallbackId: string): ParsedSession {
  const stats: ParseStats = { lines: 0, malformed: 0, unknown: {}, abandoned: 0, sidechain: 0 };
  const nodes: Node[] = [];
  const candidates: Candidate[] = [];
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let version: string | undefined;
  /** ExitPlanMode calls whose plan arrives with the result. */
  const planCalls = new Set<string>();

  const add = (r: RawRecord, role: Turn['role'], text: string): void => {
    const t = clean(text);
    if (t === '') return;
    candidates.push({
      uuid: r.uuid,
      sidechain: r.isSidechain === true,
      turn: { role, text: t, filesWritten: [], ...(isPlausibleTimestamp(r.timestamp) ? { ts: r.timestamp } : {}) },
    });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    stats.lines++;
    let r: RawRecord;
    try {
      r = JSON.parse(line) as RawRecord;
    } catch {
      stats.malformed++;
      continue;
    }

    sessionId ??= r.sessionId;
    if (cwd === undefined && typeof r.cwd === 'string' && r.cwd !== '') cwd = r.cwd;
    if (version === undefined && typeof r.version === 'string' && r.version !== '') version = r.version;

    const type = r.type ?? '(missing)';
    const content = r.message?.content;
    if (r.uuid !== undefined) {
      nodes.push({
        uuid: r.uuid,
        parent: r.parentUuid ?? null,
        humanPrompt: type === 'user' && typeof content === 'string' && !META_CONTENT.test(content),
        sidechain: r.isSidechain === true,
      });
    }
    if (NOISE_TYPES.has(type)) continue;

    if (type === 'user') {
      if (r.isCompactSummary === true || r.isMeta === true) continue;
      if (typeof content === 'string') {
        const cmd = slashCommand(content);
        if (cmd !== undefined) add(r, 'command', cmd);
        else if (!META_CONTENT.test(content)) add(r, 'user', content);
      } else if (Array.isArray(content)) {
        const answers = content.some((b) => b?.type === 'tool_result' && planCalls.has(b.tool_use_id ?? ''));
        if (answers && typeof r.toolUseResult?.plan === 'string') add(r, 'assistant', `${PLAN_PREFIX}${r.toolUseResult.plan}`);
        const text = content
          .filter((b) => b?.type === 'text' && typeof b.text === 'string' && !META_CONTENT.test(b.text))
          .map((b) => b.text as string)
          .join('\n');
        if (text !== '') add(r, 'user', text);
      }
    } else if (type === 'assistant') {
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b?.type === 'text' && typeof b.text === 'string') add(r, 'assistant', b.text);
        else if (b?.type === 'tool_use' && b.name === 'Bash' && typeof b.input?.['command'] === 'string') {
          const cmd = (b.input['command'] as string).split('\n').find((l) => SHIP_COMMAND.test(l));
          if (cmd !== undefined && !/--dry-run/.test(cmd)) add(r, 'assistant', `[ran] ${cmd.trim().slice(0, 200)}`);
        } else if (b?.type === 'tool_use' && b.name === 'ExitPlanMode') {
          if (typeof b.input?.['plan'] === 'string') add(r, 'assistant', `${PLAN_PREFIX}${b.input['plan']}`);
          else if (b.id !== undefined) planCalls.add(b.id);
        }
        else if (b?.type === 'tool_use' && WRITE_TOOLS.has(b.name ?? '')) {
          const p = b.input?.['file_path'] ?? b.input?.['notebook_path'];
          if (typeof p !== 'string') continue;
          if (candidates.at(-1)?.turn.role !== 'assistant') {
            candidates.push({ uuid: r.uuid, sidechain: r.isSidechain === true, turn: { role: 'assistant', text: '', filesWritten: [] } });
          }
          (candidates.at(-1) as Candidate).turn.filesWritten.push(clean(p, 500));
        }
      }
    } else {
      stats.unknown[type] = (stats.unknown[type] ?? 0) + 1;
    }
  }

  const dead = abandonedUuids(nodes);
  const turns: Turn[] = [];
  candidates.forEach((c, seq) => {
    if (c.sidechain) stats.sidechain++;
    else if (c.uuid !== undefined && dead.has(c.uuid)) stats.abandoned++;
    else turns.push({ seq, ...c.turn, filesWritten: [...new Set(c.turn.filesWritten)] });
  });

  return {
    sessionId: sessionId ?? fallbackId,
    ...(cwd !== undefined ? { cwd: clean(cwd, 500) } : {}),
    ...(version !== undefined ? { version } : {}),
    turns,
    stats,
  };
}
