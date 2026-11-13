import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve workspace packages to source during tests, so a clean checkout can
// run `pnpm test` without building `dist` first.
const source = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@compbotorg/organization': source('organization'),
      '@compbotorg/task': source('task'),
      '@compbotorg/runtime': source('runtime'),
      '@compbotorg/artifact': source('artifact'),
      '@compbotorg/memory': source('memory'),
      '@compbotorg/skill': source('skill'),
      '@compbotorg/policy': source('policy'),
      '@compbotorg/registry': source('registry'),
      '@compbotorg/goal': source('goal'),
      '@compbotorg/company': source('company'),
      '@compbotorg/api': source('api'),
      '@compbotorg/cli': source('cli'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
