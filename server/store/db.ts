/** The one module that opens SQLite. Schema: context/data-model.md. */

import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    harness TEXT NOT NULL,
    harness_version TEXT,
    parser TEXT NOT NULL,
    parser_match TEXT NOT NULL,
    project TEXT,
    cwd TEXT,
    transcript_path TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    mtime REAL NOT NULL DEFAULT 0,
    turns_extracted INTEGER NOT NULL DEFAULT -1,
    source_state TEXT NOT NULL DEFAULT 'live'
  );
  CREATE TABLE turns (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    ts TEXT,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    files_written TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (session_id, seq)
  );
  CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    problem TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'seed',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
  );
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    confidence REAL,
    origin TEXT NOT NULL,
    state TEXT NOT NULL,
    session_id TEXT,
    turn_seq INTEGER,
    quote TEXT,
    excerpt TEXT,
    supersedes INTEGER REFERENCES events(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX events_idea ON events(idea_id, ts);
  CREATE TABLE links (
    id INTEGER PRIMARY KEY,
    from_idea TEXT NOT NULL REFERENCES ideas(id),
    to_idea TEXT NOT NULL REFERENCES ideas(id),
    type TEXT NOT NULL,
    event_id INTEGER REFERENCES events(id)
  );
  CREATE TABLE briefs (
    id INTEGER PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    idea_version INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    idea_id TEXT REFERENCES ideas(id),
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    output_path TEXT,
    error TEXT
  );
  CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    idea_id TEXT REFERENCES ideas(id),
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    session_id TEXT,
    state TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );
  `,
  `CREATE INDEX events_supersedes ON events(supersedes);`,
  `CREATE TABLE calls (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, ok INTEGER NOT NULL);`,
  `ALTER TABLE calls ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE calls ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE calls ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;`,
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
   INSERT INTO meta (key, value) SELECT 'next_idea', COALESCE(MAX(CAST(SUBSTR(id, 3) AS INTEGER)), 0) + 1 FROM ideas;
   CREATE TABLE anchors (idea_id TEXT PRIMARY KEY, session_id TEXT, turn_seq INTEGER);
   INSERT OR IGNORE INTO anchors SELECT idea_id, session_id, turn_seq FROM events WHERE type = 'born';`,
  `ALTER TABLE sessions ADD COLUMN text_stored INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE sessions ADD COLUMN est_chars INTEGER NOT NULL DEFAULT 0;`,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const { user_version: at } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = at; v < MIGRATIONS.length; v++) {
    transact(db, () => {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Nested calls join the outer transaction. */
export function transact<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
