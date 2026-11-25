/**
 * Plans, specs and reports saved as files (D23). Scintle reads only Claude's own folder unless the person adds a
 * folder (D25): ~/.claude/plans always, plus whatever is listed in `folders`. Nothing else on disk is looked at.
 * Each document becomes a one-turn "session" holding a digest, so a long report still costs one call.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { clean } from '../lib/text.ts';
import { transact, type Db } from '../store/db.ts';

const DIGEST_MAX = 8000;
const SECTION_OPENING = 320;
const PLAN_DIRS = new Set(['plans', 'plan', 'specs', 'spec', 'context', 'rfcs', 'rfc', 'adr', 'decisions', 'proposals', 'reports']);
const PLAN_FILE = /^(plan|spec|roadmap|decisions|proposal|prd|design|userflow)[\w.-]*\.md$|[-_](plan|spec|userflow|prd)\.md$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'coverage', 'test-results', 'commands', 'skills', 'memory']);
/** Root files that describe tooling or policy, not the idea. */
const BOILERPLATE = /^(changelog|license|licence|contributing|code_of_conduct|security|claude|agents|gemini|copilot-instructions)\b/i;
const home = homedir();
const claudeDir = (): string => process.env['CLAUDE_CONFIG_DIR'] ?? join(home, '.claude');
const expand = (p: string): string => (p.startsWith('~') ? join(home, p.slice(1)) : p);
const inside = (path: string, dir: string): boolean => path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);

/** Folders the person added, in the order they appear. */
export function folders(db: Db): string[] {
  return (db.prepare('SELECT path FROM folders ORDER BY path').all() as { path: string }[]).map((r) => r.path);
}

/** The added folder a path sits in, if any. */
export function folderOf(db: Db, path: string): string | undefined {
  return folders(db).filter((f) => inside(path, f)).sort((a, b) => b.length - a.length)[0];
}

export function addFolder(db: Db, raw: string): { ok: true; path: string } | { ok: false; error: string } {
  const path = resolve(expand(raw.trim()));
  if (!raw.trim()) return { ok: false, error: 'Give a folder path' };
  if (!inside(path, home) || path === home) return { ok: false, error: 'Pick a folder inside your home folder, not the home folder itself' };
  if (inside(path, claudeDir())) return { ok: false, error: "Claude's own folder is already read" };
  try {
    if (!statSync(path).isDirectory()) return { ok: false, error: 'That is a file, not a folder' };
  } catch {
    return { ok: false, error: 'No folder at that path' };
  }
  db.prepare('INSERT INTO folders (path, added_at) VALUES (?, ?) ON CONFLICT(path) DO NOTHING').run(path, new Date().toISOString());
  return { ok: true, path };
}

/** Stop reading a folder and forget the document text read from it. Ideas and their events stay. */
export function removeFolder(db: Db, raw: string): number {
  const path = resolve(expand(raw.trim()));
  return transact(db, () => {
    db.prepare('DELETE FROM folders WHERE path = ?').run(path);
    const docs = (db.prepare("SELECT id, transcript_path FROM sessions WHERE harness = 'doc'").all() as { id: string; transcript_path: string }[])
      .filter((d) => inside(d.transcript_path, path) && folderOf(db, d.transcript_path) === undefined);
    for (const d of docs) {
      db.prepare('DELETE FROM turns WHERE session_id = ?').run(d.id);
      db.prepare("UPDATE sessions SET text_stored = 0, source_state = 'deleted' WHERE id = ?").run(d.id);
    }
    return docs.length;
  });
}

/** One time: folders the earlier automatic reader used become listed folders, so the person can see and remove them. */
export function listEarlierFolders(db: Db): void {
  if (db.prepare("SELECT 1 FROM meta WHERE key = 'folders_listed'").get()) return;
  const plans = join(claudeDir(), 'plans');
  for (const { transcript_path: p } of db.prepare("SELECT transcript_path FROM sessions WHERE harness = 'doc'").all() as { transcript_path: string }[]) {
    if (inside(p, plans)) continue;
    let d = dirname(p);
    for (let up = d; inside(up, home) && up !== home; up = dirname(up)) if (existsSync(join(up, '.git'))) { d = up; break; }
    addFolder(db, d);
  }
  db.prepare("INSERT INTO meta (key, value) VALUES ('folders_listed', 1) ON CONFLICT(key) DO NOTHING").run();
}

/** Markdown worth reading in an added folder: top-level files, plan-like folders, plan-like names anywhere. */
function docsIn(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number, inPlanDir: boolean): void => {
    if (depth > 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(p, depth + 1, inPlanDir || PLAN_DIRS.has(e.name.toLowerCase()));
      } else if (e.name.endsWith('.md') && (inPlanDir || PLAN_FILE.test(e.name) || (depth === 0 && !BOILERPLATE.test(e.name)))) out.push(p);
    }
  };
  walk(root, 0, false);
  return out;
}

/** Every document worth reading: Claude's saved plans, and what sits in the folders the person added. */
export function discoverDocs(db: Db): string[] {
  const found = new Set<string>();
  const plans = join(claudeDir(), 'plans');
  try {
    for (const f of readdirSync(plans)) if (f.endsWith('.md')) found.add(join(plans, f));
  } catch {
    // No saved plans yet.
  }
  for (const f of folders(db)) for (const p of docsIn(f)) found.add(p);
  return [...found];
}

/** Title, headings, and the opening of each section, capped. Code blocks are left out. */
export function digest(markdown: string): string {
  const text = markdown.replace(/```[\s\S]*?```/g, '');
  const parts: string[] = [];
  let opening = '';
  const flush = (): void => {
    const o = opening.replace(/\s+/g, ' ').trim();
    if (o) parts.push(o.length > SECTION_OPENING ? `${o.slice(0, SECTION_OPENING)} …` : o);
    opening = '';
  };
  for (const line of text.split('\n')) {
    if (/^#{1,4}\s/.test(line)) {
      flush();
      parts.push(line.trim());
    } else if (opening.length < SECTION_OPENING) {
      opening += ` ${line}`;
    }
  }
  flush();
  const out = parts.join('\n');
  return out.length > DIGEST_MAX ? `${out.slice(0, DIGEST_MAX)} …` : out;
}

const docId = (path: string): string => `doc-${createHash('sha256').update(path).digest('hex').slice(0, 16)}`;

/** Paths a transcript still on disk wrote: that conversation already carries the document's story. */
function coveredByTranscripts(db: Db): Set<string> {
  const covered = new Set<string>();
  const rows = db.prepare("SELECT files_written FROM turns JOIN sessions s ON s.id = turns.session_id WHERE s.harness != 'doc' AND s.source_state = 'live' AND files_written != '[]'").all() as { files_written: string }[];
  for (const r of rows) for (const f of JSON.parse(r.files_written) as string[]) covered.add(expand(f));
  return covered;
}

/** Store or refresh one document; unchanged files are skipped. Before consent, only its size is kept (D21). */
export function ingestDocs(db: Db, paths: readonly string[], withText: boolean): number {
  const covered = coveredByTranscripts(db);
  let stored = 0;
  for (const path of paths) {
    if (covered.has(path)) continue;
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    const id = docId(path);
    const prev = db.prepare('SELECT size, mtime, text_stored FROM sessions WHERE id = ?').get(id) as { size: number; mtime: number; text_stored: number } | undefined;
    if (prev && prev.size === st.size && prev.mtime === st.mtimeMs && (prev.text_stored === 1 || !withText)) continue;
    const text = clean(`${basename(path)}\n${digest(readFileSync(path, 'utf8'))}`, DIGEST_MAX + 400);
    const born = new Date(Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs)).toISOString();
    transact(db, () => {
      db.prepare(
        `INSERT INTO sessions (id, harness, parser, parser_match, project, cwd, transcript_path, started_at, ended_at, size, mtime, text_stored, est_chars, turns_extracted)
         VALUES (?, 'doc', 'markdown-digest', 'exact', ?, ?, ?, ?, ?, ?, ?, ?, ?, -1)
         ON CONFLICT(id) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, ended_at = excluded.ended_at,
           text_stored = excluded.text_stored, est_chars = excluded.est_chars, source_state = 'live', turns_extracted = -1`,
      ).run(id, basename(folderOf(db, path) ?? dirname(path)), dirname(path), path, born, new Date(st.mtimeMs).toISOString(),
        st.size, st.mtimeMs, withText ? 1 : 0, text.length + 40);
      db.prepare('DELETE FROM turns WHERE session_id = ?').run(id);
      if (withText) db.prepare("INSERT INTO turns (session_id, seq, ts, role, text, files_written) VALUES (?, 0, ?, 'doc', ?, ?)").run(id, born, text, JSON.stringify([path]));
    });
    stored++;
  }
  return stored;
}

/** Forget documents that no longer match what is read and were never sent to the model. */
export function pruneDocs(db: Db, found: readonly string[]): number {
  const keep = new Set(found);
  const stale = (db.prepare("SELECT id, transcript_path FROM sessions WHERE harness = 'doc' AND turns_extracted = -1").all() as { id: string; transcript_path: string }[])
    .filter((d) => !keep.has(d.transcript_path));
  transact(db, () => {
    for (const d of stale) {
      db.prepare('DELETE FROM turns WHERE session_id = ?').run(d.id);
      db.prepare('DELETE FROM sessions WHERE id = ?').run(d.id);
    }
  });
  return stale.length;
}
