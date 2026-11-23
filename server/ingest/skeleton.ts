/** Scintle's harness-neutral session form. Everything past `server/ingest/` reads only this. */

type Role = 'user' | 'assistant' | 'command';

export type Turn = {
  /** Ordinal among candidate turns, rewound ones included, so it stays stable as the file grows. */
  seq: number;
  ts?: string;
  role: Role;
  /** Redacted. */
  text: string;
  filesWritten: string[];
};

export type ParseStats = {
  lines: number;
  malformed: number;
  unknown: Record<string, number>;
  abandoned: number;
  sidechain: number;
};

export type ParsedSession = {
  sessionId: string;
  cwd?: string;
  version?: string;
  turns: Turn[];
  stats: ParseStats;
};
