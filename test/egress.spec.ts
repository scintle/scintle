import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchedUrls, sourcesToRead } from '../server/jobs/research.ts';
import { modelArgs, readStream } from '../server/lib/model.ts';

const flag = (args: string[], name: string): string | undefined => args[args.indexOf(name) + 1];

describe('what a model call may do', () => {
  it('has no tools, MCP, settings, slash commands or saved session unless granted, and nothing is approved on the fly', () => {
    const args = modelArgs({ tools: [], allow: [] }, 'sonnet');
    expect(flag(args, '--tools')).toBe('');
    expect(flag(args, '--allowed-tools')).toBe('');
    expect(flag(args, '--permission-mode')).toBe('dontAsk');
    expect(flag(args, '--setting-sources')).toBe('');
    for (const f of ['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) expect(args).toContain(f);
  });

  it('is granted tools only in the research job, and only WebSearch or domain-bound WebFetch', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    const granting = files('server').filter((f) => /grant[:,]|tools:\s*\[\s*'/.test(readFileSync(f, 'utf8')) && !f.endsWith('lib/model.ts'));
    expect(granting).toEqual(['server/jobs/research.ts']);
    expect(readFileSync('server/jobs/research.ts', 'utf8')).not.toMatch(/tools:\s*\[[^\]]*'(Bash|Read|Write|Edit|Glob|Grep)/);
  });
});

describe('what Research may read', () => {
  const results = ['Web search results for query: "x"\n\nLinks: [{"title":"A","url":"https://apps.example.com/a"},{"title":"B","url":"https://blog.example.org/b?x=1"}]'];

  it('keeps only URLs the search really returned, on public https hosts, and binds WebFetch to their hosts', () => {
    const searched = searchedUrls(results);
    const picked = [
      'https://apps.example.com/a',
      'https://blog.example.org/b?x=1',
      // Made up by the model, perhaps on a page's instruction: never read.
      'https://apps.example.com/my-secret-idea-text',
      'https://evil.example.net/?q=idea',
      'http://apps.example.com/a',
      'https://localhost/a',
    ];
    const { urls, grant } = sourcesToRead(picked, searched);
    expect(urls).toEqual(['https://apps.example.com/a', 'https://blog.example.org/b?x=1']);
    expect(grant).toEqual({ tools: ['WebFetch'], allow: ['WebFetch(domain:apps.example.com)', 'WebFetch(domain:blog.example.org)'] });
  });

  it('reads nothing when the search returned nothing', () => {
    expect(sourcesToRead(['https://apps.example.com/a'], searchedUrls([])).urls).toEqual([]);
  });
});

describe('reading the CLI stream', () => {
  it('finds the final result and the tool results', () => {
    const out = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'Links: [{"url":"https://a.example.com/"}]' }] } }),
      JSON.stringify({ type: 'result', result: '{"ok":true}', duration_ms: 5 }),
    ].join('\n');
    const { final, toolResults } = readStream(out);
    expect(final?.result).toBe('{"ok":true}');
    expect(searchedUrls(toolResults)).toEqual(new Set(['https://a.example.com/']));
  });
});
