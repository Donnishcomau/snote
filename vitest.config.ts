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
  // T315.2: react-ink-textarea's package.json exports map has a
  // "development" condition pointing at its raw, untranspiled TS source,
  // which Vite's resolver picks under plain `vitest run` (no NODE_ENV set).
  // That source renders a dead <TextArea> in ink-testing-library (confirmed
  // in T315.1 — lastFrame() stays "\n", no onChange/useInput ever fires),
  // while the package's built dist/index.js — what esbuild's own bundling
  // of the real CLI already resolves to, since it doesn't apply this
  // condition — works correctly. Alias the bare specifier straight to that
  // built file so tests exercise the same code the real bundle does.
  resolve: { alias: {
    '@vendor': new URL('./vendor/simplenote', import.meta.url).pathname,
    'react-ink-textarea': new URL('./node_modules/react-ink-textarea/dist/index.js', import.meta.url).pathname,
  } },
});
