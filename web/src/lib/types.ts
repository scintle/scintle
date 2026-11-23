export type Stage = 'seed' | 'exploring' | 'planned' | 'building' | 'parked' | 'released' | 'dropped' | 'evolved';

export type Idea = {
  id: string;
  title: string;
  problem: string;
  stage: Stage;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type RawEvent = {
  id: number;
  idea_id: string;
  type: string;
  ts: string;
  payload: string;
  confidence: number | null;
  origin: 'inferred' | 'user';
  state: 'dotted' | 'confirmed' | 'removed';
  session_id: string | null;
  turn_seq: number | null;
  quote: string | null;
  excerpt: string | null;
  supersedes: number | null;
  superseded: number;
};

export type Ev = Omit<RawEvent, 'payload' | 'superseded'> & { payload: Record<string, unknown>; superseded: boolean };

export type Link = { id: number; from_idea: string; to_idea: string; type: 'pivot' | 'spawn' | 'merge'; event_id: number | null };
export type Question = { id: number; idea_id: string | null; kind: string; payload: string; session_id: string | null };
export type Job = { id: number; kind: string; idea_id: string | null; status: 'running' | 'done' | 'failed'; started_at: string; finished_at: string | null; output_path: string | null; error: string | null };
export type Source = { state: 'live' | 'expiring' | 'deleted' | 'none'; expiresInDays?: number; project: string | null };

export type Snapshot = {
  ideas: Idea[];
  events: RawEvent[];
  links: Link[];
  questions: Question[];
  jobs: Job[];
  sources: Record<string, Source>;
  calls: { calls: number; inputTokens: number; outputTokens: number; minutes: number; cap: number };
  now: string;
  version: number;
  extracting: string | null;
  waiting: { sessions: number; chars: number; chunks: number };
  progress: { done: number; total: number; startedAt: string } | null;
  readError: { message: string; at: string; capped: boolean } | null;
  consent: boolean;
  logos: Record<string, string>;
};

export type Undo = { kind: 'set-state'; event: number; state: string } | { kind: 'remove-event'; event: number } | { kind: 'none' };
export type ActionResult = { ok: true; undo: Undo; id?: string | number } | { ok: false; error: string };
