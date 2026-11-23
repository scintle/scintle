import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where Scintle keeps its own data. */
export function dataDir(env = process.env): string {
  return env['SCINTLE_HOME'] ?? join(env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share'), 'scintle');
}

/** Transcript roots to read. */
export function transcriptRoots(env = process.env): string[] {
  return [join(env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'), 'projects')];
}

/** Working-directory names of headless `claude -p` runs: ours and vibesenpai's. Never ideas. */
export const OWN_RUN_MARKERS = ['scintle-run', 'vibesenpai-judge', 'agentsensei-judge'];
