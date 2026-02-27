import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run sequentially to avoid DB conflicts
      },
    },
    fileParallelism: false, // Run test files sequentially (shared test DB)
    reporters: ['verbose'],
    sequence: {
      setupFiles: 'list',
    },
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, 'server'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
