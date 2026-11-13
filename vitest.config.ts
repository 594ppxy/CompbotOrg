import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve workspace packages to source during tests, so a clean checkout can
  // run `pnpm test` without building `dist` first.
  resolve: {
    alias: {
      '@compbotorg/organization': fileURLToPath(
        new URL('./packages/organization/src/index.ts', import.meta.url),
      ),
      '@compbotorg/task': fileURLToPath(
        new URL('./packages/task/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
