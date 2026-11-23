/** Board flows against a throwaway scintled with seeded data. No model calls. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const home = mkdtempSync(join(tmpdir(), 'scintle-e2e-'));
const env = { ...process.env, SCINTLE_HOME: home, SCINTLE_PORT: '4931' };
const cli = (...args: string[]): string =>
  execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(import.meta.dirname, '../../server/cli.ts'), ...args], { env, encoding: 'utf8' });
let base = '';
let token = '';

async function api(path: string, body: object = {}): Promise<unknown> {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-scintle-token': token }, body: JSON.stringify(body) });
  return r.json();
}

test.beforeAll(async () => {
  base = cli('ensure').trim();
  token = readFileSync(join(home, 'token'), 'utf8').trim();
  await api('/api/ideas', { title: 'Trail alerts', problem: 'Hikers find trails closed' });
  await api('/api/ideas', { title: 'Recipe scaler', problem: 'Cooks rescale recipes by hand' });
  await api('/api/ideas/I-002/stage', { type: 'parked', why: 'not now' });
});

test.afterAll(() => {
  cli('stop');
  rmSync(home, { recursive: true, force: true });
});

async function open(page: Page): Promise<void> {
  await page.goto(`${base}/?t=${token}`);
  await expect(page.locator('.card').first()).toBeVisible();
}

test('New idea creates a seed and opens it', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New idea' }).click();
  await page.getByLabel('Name it in a few words').fill('Board that keeps itself');
  await page.getByRole('button', { name: 'Create idea' }).click();
  await expect(page.getByRole('region', { name: 'Seed' }).getByText('Board that keeps itself')).toBeVisible();
  await expect(page.getByRole('complementary')).toContainText('Board that keeps itself');
});

test('A stage move can be undone from the toast', async ({ page }) => {
  await open(page);
  await page.locator('.card', { hasText: 'Trail alerts' }).click();
  await page.getByRole('complementary').getByRole('button', { name: /Seed/ }).click();
  await page.getByRole('menuitem', { name: /Drop/ }).click();
  await expect(page.getByText('Closed ·')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Seed' }).getByText('Trail alerts')).toBeVisible();
});

test('Timeline events open and step with the arrow keys', async ({ page }) => {
  await open(page);
  await page.locator('.card', { hasText: 'Recipe scaler' }).click();
  await page.locator('.ev-row').first().click();
  await expect(page.locator('.ev-card')).toContainText('made on the board');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ev[aria-expanded="true"] .type')).toHaveText('Parked');
});

test('⌘K finds an idea by name', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await page.getByRole('textbox', { name: 'Ask the board' }).fill('recipe');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toContainText('Recipe scaler');
});

test('Plan implementation shows a brief with the marker and the command', async ({ page }) => {
  await open(page);
  await page.locator('.card', { hasText: 'Trail alerts' }).click();
  await page.getByRole('button', { name: 'Plan implementation' }).click();
  await expect(page.locator('.brief')).toContainText('scintle:idea=I-001@v');
  await expect(page.getByRole('button', { name: 'Copy /scintle:plan I-001' })).toBeVisible();
});

test('Live update: an idea made elsewhere appears without a reload', async ({ page }) => {
  await open(page);
  await api('/api/ideas', { title: 'Made from another tab' });
  await expect(page.getByText('Made from another tab')).toBeVisible();
});

test('Lineage: River and Constellation draw every idea and open one on click', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Lineage' }).click();
  await page.getByRole('button', { name: 'River' }).click();
  await expect(page.locator('.g-idea').first()).toBeVisible();
  expect(await page.locator('.g-idea').count()).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Constellation' }).click();
  await expect(page.locator('.cnode').first()).toBeVisible();
  await page.locator('.cnode').first().click();
  await expect(page.getByRole('complementary').locator('h2')).toBeVisible();
});
