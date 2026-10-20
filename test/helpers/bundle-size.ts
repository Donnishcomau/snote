/**
 * chunk-keys slice 2 (F193): the one bundle size cap and the one way to measure
 * it, shared by every test that checks the bundle's size.
 */

/**
 * Raised from 1,545,000 to 1,565,000: measured 1,544,516 bytes at 8755a49 (a
 * normal checkout), so 20,484 bytes of headroom, the same margin as the
 * 2026-10-07 and 2026-10-09 raises. A regression of Ink devtools and `ws`
 * (~129 KB) still exceeds it; test/cli/bundle-size.test.ts line 2 guards that
 * directly.
 */
export const BUNDLE_CAP = 1565000;

/**
 * The bundle's size in bytes as a normal checkout builds it. esbuild names each
 * module by its path relative to the working directory, in a `// <path>` line and
 * in a `  "<path>"(exports` wrapper key; with a symlinked `node_modules` (a lane
 * worktree) that path climbs out (`../../`) to the link's target and is longer.
 * Each such path is cut back to start at `node_modules/` before counting, which
 * gives the normal checkout's bundle byte for byte (checked at 8755a49).
 */
export function bundleSize(text: string): number {
  return Buffer.byteLength(text.replace(/^(\/\/ |  ")(?:\.\.\/)+[^\n"]*?node_modules\//gm, '$1node_modules/'), 'utf8');
}
