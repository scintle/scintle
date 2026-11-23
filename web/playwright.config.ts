import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  use: { channel: 'chrome', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
});
