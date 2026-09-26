import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { 
    globals: true,
    pool: 'forks', maxWorkers: 2, minWorkers: 1,
    include: ['test/**/*.test.{ts,tsx}', 'vendor/**/*.test.{ts,tsx}'], 
    environment: 'node', 
    testTimeout: 3000, hookTimeout: 3000,
    setupFiles: ['./test/setup.ts'],
  }, 
  resolve: { alias: { '@vendor': new URL('./vendor/simplenote', import.meta.url).pathname } },
});
