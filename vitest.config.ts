import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { linuxOnlyExclude } from './test/helpers/linux-only';
// #448: on macOS the files in test/linux-only.txt are skipped by this one rule (none deleted).
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const LINUX_ONLY = linuxOnlyExclude(process.platform, ROOT);
// vitest does not count an excluded file as skipped, so a darwin run says how many it did not run.
if (LINUX_ONLY.length > 0) process.stderr.write(`linux-only: ${LINUX_ONLY.length} test files not run on darwin (test/linux-only.txt)\n`);
export default defineConfig({
  test: { 
    globals: true,
    pool: 'forks', maxWorkers: 2, minWorkers: 1,
    include: ['test/**/*.test.{ts,tsx}', 'vendor/**/*.test.{ts,tsx}'], 
    exclude: [...configDefaults.exclude, ...LINUX_ONLY],
    environment: 'node', 
    testTimeout: 3000, hookTimeout: 3000,
    reporters: ['default', './test/helpers/headroom-reporter.ts'],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/helpers/global-leak-guard.ts'],
  }, 
  //.2: react-ink-textarea's package.json exports map has a
  // "development" condition pointing at its raw, untranspiled TS source,
  // which Vite's resolver picks under plain `vitest run` (no NODE_ENV set).
  // That source renders a dead <TextArea> in ink-testing-library (confirmed
  // in.1 — lastFrame() stays "\n", no onChange/useInput ever fires),
  // while the package's built dist/index.js — what esbuild's own bundling
  // of the real CLI already resolves to, since it doesn't apply this
  // condition — works correctly. Alias the bare specifier straight to that
  // built file so tests exercise the same code the real bundle does.
  resolve: { alias: {
    '@vendor': new URL('./vendor/simplenote', import.meta.url).pathname,
    'react-ink-textarea': new URL('./node_modules/react-ink-textarea/dist/index.js', import.meta.url).pathname,
  } },
});
