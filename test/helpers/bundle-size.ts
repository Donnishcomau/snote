import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';

/**
 * chunk-keys slice 2: the one bundle size cap and the one way to measure
 * it, shared by every test that checks the bundle's size.
 */

/**
 * Raised from 1,545,000 to 1,565,000: measured 1,544,516 bytes at 8755a49 (a
 * normal checkout), so 20,484 bytes of headroom, the same margin as the
 * 2026-10-07 and 2026-10-09 raises. A regression of Ink devtools and `ws`
 * (~129 KB) still exceeds it; test/cli/bundle-size.test.ts line 2 guards that
 * directly.
 *
 * #30cap (split cap, 2026-10-21): raised 1,565,000 -> 1,600,000 for the
 * single-file total only (cap c). The updater is lazy-loaded, so the cost of a normal
 * start is capped separately (STARTUP_CAP, a) and the updater's own chunks too (LAZY_CAP, b).
 */
/** cap3 (2026-10-22): single-file total raised 1,600,000 -> 1,620,000 for the lazy 0.2.9 installer code. */
// #558 (2026-10-30): 1,624,300 -> 1,624,600 (measured 1,624,490 with #558 and #553 added to #555: absent tags and systemTags are filled at the mend seam)
// #553 v9 (2026-10-31): 1,624,600 -> 1,625,200 (measured 1,624,478; v9 adds an estimated +110 to +150; #562 follows)
// #606 (2026-11-02): 1,625,200 -> 1,625,800 (measured 1,625,519; the secureExclusiveCreate fix is +436; headroom comes back with the #572 diet)
// #572 diet (2026-11-03): 1,625,800 -> 1,603,900 (measured 1,591,814 with the websocket client-only plugin, -33,843; +12,000 = 2,000 Q-REG-08 floor + about 10,000 for 0.2.11 lanes 2 to 10)
// 0.2.11 caps (2026-11-03, #674): 1,603,900 -> 1,609,000 (measured main 3751be4c 1,598,534; the 0.2.11 changes still to land sum about 7,233)
// 0.2.11 stack (2026-11-06, QL measure, owner call): 1,609,000 -> 1,613,000 (measured main 47402122 + #706 rev4 + #711 + #710 1,610,491)
export const BUNDLE_CAP = 1613000;
// #478 carrier (2026-10-30, revised): 1,620,000 -> 1,624,000 (measured #478 1,620,463, #543 1,622,164, #545 +193; all three queued)
// #555 (2026-10-30): 1,624,000 -> 1,624,300 (measured #555 1,623,693 alone, +429; 1,624,094 stacked on #553's +401)

/** (a) bytes of the plugin-dist start set: cli.js, snote-main.js and everything they import statically. */
/** cap2 (2026-10-21): raised 1,583,000 -> 1,595,000 once for 0.2.9 (109 measured 1,583,446; f237, f237b, the bar chain and sync-8 follow). */
/** #137 (2026-10-26): 1,596,000 -> 1,597,000 for the logout warning (+about 1,060 bytes). */
// #387 (2026-10-28): 1,597,000 -> 1,598,000 for the inline autosave
// #97 97b (2026-10-28): 1,598,000 -> 1,599,500 for the write watch (covers 97c to 97f)
// #97 97e (2026-10-29): 1,599,500 -> 1,600,100 for the sidecar after each write (97e measured +748)
// #97 97g (2026-10-29): 1,600,100 -> 1,601,000 for the sidecar at close (97g measured +285)
// #494 with #415 (2026-10-29): 1,601,000 -> 1,601,200 for the preview strip (#494 +120) stacked on the simperium queue trim (#415 +571, stacked 1,601,074)
// #336a with #337 (2026-10-30): 1,601,400 -> 1,605,000 for the pending-notes file (336a +1,698) and the held-send fix (337 +~900) plus the 336a data-loss fixes A1-A3; diet3 must free bytes before anything else starts
// #336a with #337c and #545 (2026-10-30): 1,605,000 -> 1,605,600 (measured 1,605,150 with #541 + #542; #545 about +152); diet3 resets
// #546 diet3 (2026-10-30): 1,605,600 -> 1,598,300 (measured S 1,594,799; headroom for #545 #543 #478 #475, +3,130 estimated)
// #555 (2026-10-30): 1,598,300 -> 1,599,000 (measured #555 1,598,473 alone, +429; 1,598,874 stacked on #553)
// #558 (2026-10-30): 1,599,000 -> 1,599,400 (measured 1,599,268 with #558 and #553 added to #555)
// #553 v9 (2026-10-31): 1,599,400 -> 1,600,000 (measured 1,599,256; v9 adds an estimated +110 to +150; #562 follows)
// #606 (2026-11-02): 1,600,000 -> 1,600,600 (measured main 8f510eba 1,599,859; fix 1,600,295, +436; headroom returns with the #572 diet)
// #572 diet (2026-11-03): 1,600,600 -> 1,578,600 (measured 1,566,599 with the websocket client-only plugin, -33,797; +12,000 = 2,000 Q-REG-08 floor + about 10,000 for 0.2.11 lanes 2 to 10)
// 0.2.11 caps (2026-11-03, #674): 1,578,600 -> 1,583,000 (measured main 3751be4c 1,571,864; the 0.2.11 changes still to land sum about 7,176)
// 0.2.11 stack (2026-11-06, QL measure, owner call): 1,583,000 -> 1,586,000 (measured main 47402122 + #706 rev4 + #711 + #710 1,583,738)
export const STARTUP_CAP = 1586000;

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
// 0.2.11 lazy set (2026-11-03): update-helper-start and update-fetch-verify left src/core, so the lazy set measured 0 and
// bundle-split test 2 checked nothing. The update check is now the four modules src/cli/main.tsx loads with `await import()`.
export const UPDATER_MODULES = ['update-check', 'update-run', 'update-watch', 'install-kind', 'release-verify', 'allowed-signers'];

/** The ones loaded by a dynamic `import()` from the app (the roots of the lazy set); the rest are pulled in by them. */
export const UPDATER_ENTRIES = ['update-check', 'update-run', 'update-watch', 'install-kind'];

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
