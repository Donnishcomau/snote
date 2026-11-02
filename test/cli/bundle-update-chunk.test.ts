/**
 * diet3 (#30): the update check and the 24 h watch (src/core/update-check.ts, update-run.ts, update-watch.ts:
 * the release fetch and its parsing) load with `import()` after the store exists, so a normal start does not parse them.
 * src/cli/main.tsx keeps the `SNOTE_UPDATE_CHECK !== 'disabled'` test sentinel in front of the first import, and the
 * whole block still ends in a catch, so a chunk that cannot load is a missing update notice, never a crash.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSplitDist, chunkGraph, type ChunkGraph } from '../helpers/bundle-size';

const UPDATE_FUNCTIONS = ['checkRemoteUpdate', 'checkRemoteVersion', 'runUpdateChecks', 'startUpdateWatch'];
const defines = (text: string, name: string): boolean => new RegExp(`function ${name}\\d*\\(`).test(text);
let dist = '';
let graph: ChunkGraph;

function srcFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? srcFiles(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
}

beforeAll(async () => {
  dist = await buildSplitDist();
  graph = chunkGraph(dist);
}, 60000);

afterAll(() => {
  fs.rmSync(dist, { recursive: true, force: true });
});

describe('diet3: the update check and watch are not in the start set', () => {
  it('1: WHEN the split plugin-dist is built THEN no start-set file defines `checkRemoteUpdate`, `checkRemoteVersion`, `runUpdateChecks` or `startUpdateWatch`, and each is defined in `1` chunk outside the start set', () => {
    expect(graph.start.has('snote-main.js')).toBe(true);
    const startText = [...graph.start.keys()].map((rel) => fs.readFileSync(path.join(dist, rel), 'utf8'));
    const lazyText = fs.readdirSync(path.join(dist, 'chunks')).filter((f) => !graph.start.has(path.join('chunks', f))).map((f) => fs.readFileSync(path.join(dist, 'chunks', f), 'utf8'));
    for (const name of UPDATE_FUNCTIONS) {
      expect(startText.filter((t) => defines(t, name)).length, `${name} in the start set`).toBe(0);
      expect(lazyText.filter((t) => defines(t, name)).length, `${name} in a lazy chunk`).toBe(1);
    }
  });

  it('2: WHEN src is scanned THEN `src/cli/main.tsx` imports none of `core/update-check`, `core/update-run` and `core/update-watch` statically, and loads each with `import(`', () => {
    const root = path.join(process.cwd(), 'src');
    const main = fs.readFileSync(path.join(root, 'cli', 'main.tsx'), 'utf8');
    for (const m of ['update-check', 'update-run', 'update-watch']) {
      expect(new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+['"]\\.\\./core/${m}['"]`, 'm').test(main), `${m} static in main.tsx`).toBe(false);
      expect(new RegExp(`import\\(\\s*['"]\\.\\./core/${m}['"]\\s*\\)`).test(main), `${m} import() in main.tsx`).toBe(true);
    }
    const eager = srcFiles(root).filter((f) => /^src\/cli\//.test(path.relative(process.cwd(), f)) && /^\s*import\s+(?!type\b)[^;]*?from\s+['"]\.\.\/core\/update-(?:check|run|watch)['"]/m.test(fs.readFileSync(f, 'utf8')));
    expect(eager.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("3: WHEN `src/cli/main.tsx` is read THEN the `SNOTE_UPDATE_CHECK !== 'disabled'` test sentinel comes before the first `import('../core/update-` and `updateCheckEnabled(process.env)` is tested before the `install-kind` import, and the block ends with `.catch(() => {})`, with the exact opt-out lines, and `run: homepageGuard()` twice between the update-run import and the catch", () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    const at = (s: string): number => main.indexOf(s);
    expect(at("process.env.SNOTE_UPDATE_CHECK !== 'disabled'")).toBeGreaterThan(-1);
    expect(at("process.env.SNOTE_UPDATE_CHECK !== 'disabled'")).toBeLessThan(at("import('../core/update-check')"));
    expect(at('updateCheckEnabled(process.env)')).toBeGreaterThan(at("import('../core/update-check')"));
    expect(at('updateCheckEnabled(process.env)')).toBeLessThan(at("import('../core/install-kind')"));
    expect(at("import('../core/install-kind')")).toBeLessThan(at("import('../core/update-run')"));
    expect(at("import('../core/update-watch')")).toBeLessThan(at('})().catch(() => {});'));
    expect(main.includes("if (process.env.SNOTE_UPDATE_CHECK !== 'disabled') {")).toBe(true);
    expect(main.includes('if (!updateCheckEnabled(process.env)) return;')).toBe(true);
    const block = main.slice(at("import('../core/update-run')"), at('})().catch(() => {});'));
    expect(block.split('run: homepageGuard()').length - 1).toBe(2);
  });
});
