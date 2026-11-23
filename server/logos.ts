/**
 * Finds an idea's own logo: the git repo its sessions worked in, then the most logo-like image in it.
 * Local files only; nothing is fetched or sent anywhere (D20).
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import type { Db } from './store/db.ts';

const IMAGE = new Set(['.svg', '.png', '.ico', '.webp', '.jpg', '.jpeg']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', 'Pods', 'test-results']);
/** Framework and sample art that ships inside projects but is not theirs. */
const NOT_THEIRS = /react|vite|next|tailwind|expo|vercel|angular|vue|svelte|electron|github|google|apple|android|placeholder|example|sample/i;
const MAX_BYTES = 1_000_000;
const TTL_MS = 10 * 60_000;

const home = homedir();
const expand = (p: string): string => (p.startsWith('~') ? join(home, p.slice(1)) : p);

function gitRoot(dir: string): string | undefined {
  for (let d = expand(dir); d.startsWith(home) && d !== home; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
  }
  return undefined;
}

/** Higher is more likely the project's own mark. */
function score(path: string, root: string): number {
  const name = path.split('/').at(-1)?.toLowerCase() ?? '';
  const rel = relative(root, path).toLowerCase();
  if (NOT_THEIRS.test(name)) return -1;
  let s = extname(name) === '.svg' ? 3 : extname(name) === '.ico' ? 0 : 1;
  if (/^(mark|logo)\b/.test(name) || /[-_.](mark|logo)\b/.test(name)) s += 4;
  else if (/^(icon|app-icon|apple-touch-icon)\b/.test(name)) s += 2;
  else if (/^favicon\b/.test(name)) s += 1;
  else return -1;
  if (/brand/.test(rel)) s += 2;
  if (/(^|\/)(public|assets|static|images)\//.test(rel)) s += 1;
  return s - rel.split('/').length * 0.1;
}

function findLogo(root: string): string | undefined {
  let best: { path: string; s: number } | undefined;
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(p, depth + 1); continue; }
      if (!IMAGE.has(extname(e.name).toLowerCase())) continue;
      const s = score(p, root);
      if (s < 0 || (best && s <= best.s)) continue;
      try {
        if (statSync(p).size > MAX_BYTES) continue;
      } catch {
        continue;
      }
      best = { path: p, s };
    }
  };
  walk(root, 0);
  return best?.path;
}

const NEAR_TURNS = 10;

/**
 * The repo an idea lives in. A session run inside a repo says so outright; otherwise only files written
 * close to where the idea itself came up count, because one session often touches several ideas.
 */
function ideaRoot(db: Db, ideaId: string): string | undefined {
  const anchors = db.prepare(
    `SELECT e.session_id, e.turn_seq, s.cwd FROM events e JOIN sessions s ON s.id = e.session_id
     WHERE e.idea_id = ? AND e.state != 'removed' AND e.turn_seq IS NOT NULL`,
  ).all(ideaId) as { session_id: string; turn_seq: number; cwd: string | null }[];
  const votes = new Map<string, number>();
  const vote = (dir: string, weight: number): void => {
    const r = gitRoot(dir);
    if (r) votes.set(r, (votes.get(r) ?? 0) + weight);
  };
  const near = db.prepare('SELECT files_written FROM turns WHERE session_id = ? AND seq BETWEEN ? AND ?');
  for (const a of anchors) {
    if (a.cwd && gitRoot(a.cwd)) { vote(a.cwd, 3); continue; }
    for (const r of near.all(a.session_id, a.turn_seq - NEAR_TURNS, a.turn_seq + NEAR_TURNS) as { files_written: string }[]) {
      for (const f of JSON.parse(r.files_written) as string[]) vote(dirname(f), 1);
    }
  }
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const cache = new Map<string, { path: string | undefined; at: number }>();

/** The logo file for an idea, if its repo has one. Cached briefly; it walks the disk. */
export function logoFor(db: Db, ideaId: string): string | undefined {
  const hit = cache.get(ideaId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.path;
  const root = ideaRoot(db, ideaId);
  const path = root ? findLogo(root) : undefined;
  cache.set(ideaId, { path, at: Date.now() });
  return path;
}
