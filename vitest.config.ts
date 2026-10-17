import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/ambiente.ts'],
    maxWorkers: 2,
    env: { NODE_ENV: 'test', TZ: 'UTC' }
  }
});
