import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';

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
 *
 * #30cap (quality-lead's split cap, 2026-10-21): raised 1,565,000 -> 1,600,000 for the
 * single-file total only (cap c). The updater is lazy-loaded, so the cost of a normal
 * start is capped separately (STARTUP_CAP, a) and the updater's own chunks too (LAZY_CAP, b).
 */
export const BUNDLE_CAP = 1600000;

/** (a) bytes of the plugin-dist start set: cli.js, snote-main.js and everything they import statically. */
export const STARTUP_CAP = 1583000;

/** (b) bytes of the updater's own dynamic-import chunks (and what only they pull in). */
export const LAZY_CAP = 30000;

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

/**
 * The split plugin-dist (scripts/build-plugin-dist.mjs, esbuild `splitting: true`) as
 * one graph: `start` is cli.js, snote-main.js and every file reachable from them
 * through STATIC `import ... from` / `export ... from` (a dynamic `import()` is not an
 * edge); `lazy` is the updater's own dynamic chunks (UPDATER_ENTRIES) plus whatever
 * only they pull in. Sizes go through bundleSize, so a symlinked node_modules counts
 * as a normal checkout.
 */
export const UPDATER_MODULES = ['update-helper-start', 'update-fetch-verify', 'release-verify', 'allowed-signers'];

/** The ones loaded by a dynamic `import()` from the app (the roots of the lazy set); the rest are pulled in by them. */
export const UPDATER_ENTRIES = ['update-helper-start', 'update-fetch-verify'];

export interface ChunkGraph {
  start: Map<string, number>;
  lazy: Map<string, number>;
  startBytes: number;
  lazyBytes: number;
}

export function chunkGraph(dir: string): ChunkGraph {
  const staticEdges = (rel: string): string[] => {
    const text = fs.readFileSync(path.join(dir, rel), 'utf8');
    const re = /(?:^|[;\n}])\s*(?:import|export)\s*(?:[^'";(]*?\sfrom\s*)?["'](\.[^"']+)["']/g;
    const out: string[] = [];
    for (let m = re.exec(text); m; m = re.exec(text)) out.push(path.relative(dir, path.resolve(path.dirname(path.join(dir, rel)), m[1])));
    return out;
  };
  const walk = (roots: string[], skip: Map<string, number>): Map<string, number> => {
    const seen = new Map<string, number>();
    const todo = [...roots];
    for (let rel = todo.pop(); rel !== undefined; rel = todo.pop()) {
      if (seen.has(rel) || skip.has(rel)) continue;
      seen.set(rel, bundleSize(fs.readFileSync(path.join(dir, rel), 'utf8')));
      todo.push(...staticEdges(rel));
    }
    return seen;
  };
  const start = walk(['cli.js', 'snote-main.js'], new Map());
  const roots = fs.readdirSync(path.join(dir, 'chunks')).filter((f) => UPDATER_ENTRIES.some((m) => f.startsWith(`${m}-`))).map((f) => path.join('chunks', f));
  const lazy = walk(roots, start);
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
  return { start, lazy, startBytes: sum(start), lazyBytes: sum(lazy) };
}

/** Build the split plugin-dist into a fresh temp dir exactly as the release does; the caller removes it. */
export async function buildSplitDist(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-split-'));
  await buildPluginDist(dir);
  return dir;
}
