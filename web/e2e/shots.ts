/** Screenshots of the running board in both themes: `node --experimental-strip-types e2e/shots.ts <outdir> [state...]`. */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const home = process.env['SCINTLE_HOME'] ?? join(homedir(), '.local', 'share', 'scintle');
const { port } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8')) as { port: number };
const token = readFileSync(join(home, 'token'), 'utf8').trim();
const out = process.argv[2] ?? '.';
const states = process.argv.slice(3);

const browser = await chromium.launch({ channel: 'chrome' });
for (const scheme of ['light', 'dark'] as const) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => console.error(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?t=${token}`);
  await page.waitForSelector('.card, .state', { timeout: 10_000 });
  for (const s of ['board', ...states]) {
    if (s === 'panel') await page.locator('.card', { hasText: 'vibesenpai' }).first().click();
    if (s === 'event') await page.locator('.ev-row').first().click();
    if (s === 'river') { await page.getByRole('button', { name: 'Lineage' }).click(); await page.getByRole('button', { name: 'River' }).click(); }
    if (s === 'constellation') await page.getByRole('button', { name: 'Constellation' }).click();
    if (s === 'cmd') await page.keyboard.press('Meta+k');
    if (s === 'new') { await page.keyboard.press('Escape'); await page.keyboard.press('n'); }
    if (s === 'brief') { await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Plan implementation' }).click(); }
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `${s}-${scheme}.png`) });
  }
  await page.close();
}
await browser.close();
