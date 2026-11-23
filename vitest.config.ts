import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'web/src/**/*.spec.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
