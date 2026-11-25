import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ingestFile } from '../server/ingest/index.ts';
import { openDb } from '../server/store/db.ts';

// Synthetic secrets in the shapes people paste into chats; none are real.
const SECRETS = {
  anthropic: 'sk-ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0'.repeat(4),
  github: 'ghp_' + 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe9Dc8B',
  aws: 'AKIA' + 'QWERTYUIOP123456',
  password: 'hunter2-correct-horse',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  email: 'jane.doe@example.com',
  pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAsecretsecret\n-----END RSA PRIVATE KEY-----',
};

const dir = mkdtempSync(join(tmpdir(), 'scintle-redact-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const rec = (uuid: string, parent: string | null, type: string, content: unknown): string =>
  JSON.stringify({ uuid, parentUuid: parent, sessionId: 'red', timestamp: '2026-11-24T10:00:00.000Z', version: '2.1.330', cwd: '/w/app', type, message: { role: type, content } });

describe('redaction on the way in', () => {
  it('stores no secret from a session, in turn text or anywhere else in the database', () => {
    const lines = [
      rec('a', null, 'user', `my .env has ANTHROPIC_API_KEY=${SECRETS.anthropic} and DB_PASSWORD=${SECRETS.password}`),
      rec('b', 'a', 'assistant', [{ type: 'text', text: `Rotate ${SECRETS.github} and ${SECRETS.aws}; mail ${SECRETS.email}.` }]),
      rec('c', 'b', 'user', `Authorization: Bearer ${SECRETS.jwt}\n${SECRETS.pem}\nidea: a board that tracks ideas`),
    ];
    const path = join(dir, 'red.jsonl');
    writeFileSync(path, lines.join('\n') + '\n');
    const db = openDb(join(dir, 'scintle.db'));
    expect(ingestFile(db, path).status).toBe('ingested');

    const turns = db.prepare('SELECT text FROM turns').all() as { text: string }[];
    const all = turns.map((t) => t.text).join('\n');
    expect(all).toContain('a board that tracks ideas');
    // Proves the secrets reached ingest and were replaced, not skipped.
    for (const kind of ['api-key', 'secret-assignment', 'jwt', 'email', 'private-key']) expect(all).toContain(`[REDACTED:${kind}]`);
    db.close();

    // The whole file, not just the turns table: nothing secret anywhere on disk.
    const raw = readdirSync(dir).filter((f) => f.startsWith('scintle.db')).map((f) => readFileSync(join(dir, f)).toString('latin1')).join('');
    for (const [name, value] of Object.entries(SECRETS)) {
      const needle = name === 'pem' ? 'MIIEowIBAAKCAQEAsecretsecret' : value;
      expect(raw.includes(needle), `${name} leaked into the database`).toBe(false);
    }
  });
});

describe('diagnostics', () => {
  it('keeps error lines but drops secrets and paths', async () => {
    const { recentErrors } = await import('../server/diagnostics.ts');
    const log = ['started', `read error: ENOENT /Users/jane/Workspace/secret-project/plan.md`, `extract failed with ANTHROPIC_API_KEY=${SECRETS.anthropic}`].join('\n');
    const out = recentErrors(log).join('\n');
    expect(out).toContain('ENOENT');
    expect(out).not.toContain('secret-project');
    expect(out).not.toContain(SECRETS.anthropic);
    expect(out).not.toContain('started');
  });
});
