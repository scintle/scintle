import { describe, expect, it } from 'vitest';
import { cleanSvg } from '../server/jobs/logo.ts';

const ok = '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#3b2db5"/><circle cx="32" cy="32" r="14" fill="#fff4e0"/></svg>';

describe('drawn logo cleaning', () => {
  it('keeps plain shapes and adds the SVG namespace', () => {
    expect(cleanSvg(ok)).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
  it.each([
    ['a script', '<svg viewBox="0 0 64 64"><script>alert(1)</script></svg>'],
    ['an event handler', '<svg viewBox="0 0 64 64"><rect width="1" height="1" onclick="x()"/></svg>'],
    ['an external link', '<svg viewBox="0 0 64 64"><image href="https://x.test/a.png"/></svg>'],
    ['a foreign object', '<svg viewBox="0 0 64 64"><foreignObject><div/></foreignObject></svg>'],
    ['text', '<svg viewBox="0 0 64 64"><text>Hi</text></svg>'],
    ['an external url() fill', '<svg viewBox="0 0 64 64"><rect fill="url(https://x.test/p)"/></svg>'],
    ['an entity', '<svg viewBox="0 0 64 64">&xxe;<rect/></svg>'],
  ])('rejects %s', (_, svg) => {
    expect(cleanSvg(svg)).toBeUndefined();
  });
  it('allows in-document gradient references', () => {
    expect(cleanSvg('<svg viewBox="0 0 64 64"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect fill="url(#g)"/></svg>')).toBeDefined();
  });
});

describe('drawn logo colours', () => {
  it('are stable per idea and spread across the palette', async () => {
    const { logoColour } = await import('../server/jobs/logo.ts');
    expect(logoColour('I-004')).toEqual(logoColour('I-004'));
    const ids = Array.from({ length: 11 }, (_, i) => `I-${String(i + 1).padStart(3, '0')}`);
    expect(new Set(ids.map((id) => logoColour(id)[0])).size).toBeGreaterThanOrEqual(7);
  });
});
