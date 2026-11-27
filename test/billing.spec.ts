import { describe, expect, it } from 'vitest';
import { billedTo } from '../server/lib/model.ts';

describe('who pays for model calls', () => {
  it('is the Claude login when nothing overrides it', () => {
    expect(billedTo({})).toBeNull();
  });
  it('follows Claude Code’s order: cloud provider, then auth token, then API key', () => {
    expect(billedTo({ ANTHROPIC_API_KEY: 'x' })).toMatch(/ANTHROPIC_API_KEY/);
    expect(billedTo({ ANTHROPIC_API_KEY: 'x', ANTHROPIC_AUTH_TOKEN: 'y' })).toMatch(/ANTHROPIC_AUTH_TOKEN/);
    expect(billedTo({ ANTHROPIC_API_KEY: 'x', CLAUDE_CODE_USE_BEDROCK: '1' })).toMatch(/Bedrock/);
    expect(billedTo({ CLAUDE_CODE_USE_VERTEX: '1' })).toMatch(/Vertex/);
    expect(billedTo({ CLAUDE_CODE_USE_FOUNDRY: '1' })).toMatch(/Foundry/);
  });
  it('ignores an empty key and a provider flag that is not 1', () => {
    expect(billedTo({ ANTHROPIC_API_KEY: '', CLAUDE_CODE_USE_BEDROCK: '0' })).toBeNull();
  });
});
