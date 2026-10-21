/**
 * #30cap: the split plugin-dist is measured as a graph. A normal start loads
 * cli.js, snote-main.js and their static imports (cap a); the updater's own
 * chunks are loaded only by `await import()` after a y (cap b). The single-file
 * total (cap c) stays in test/cli/bundle-size.test.ts.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LAZY_CAP, STARTUP_CAP, UPDATER_ENTRIES, UPDATER_MODULES, chunkGraph, buildSplitDist, type ChunkGraph } from '../helpers/bundle-size';

const dirs: string[] = [];
let graph: ChunkGraph;

beforeAll(async () => {
  const dir = await buildSplitDist();
  dirs.push(dir);
  graph = chunkGraph(dir);
}, 60000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('#30cap split bundle caps', () => {
  it('1: WHEN the split plugin-dist is built THEN its start set (cli.js, snote-main.js and their static imports) is above `1000000` and below `STARTUP_CAP` (`1583000`) bytes', () => {
    expect(graph.start.has('snote-main.js')).toBe(true);
    expect(graph.startBytes).toBeGreaterThan(1000000);
    expect(graph.startBytes).toBeLessThan(STARTUP_CAP);
    expect(STARTUP_CAP).toBe(1583000);
  });

  it('2: WHEN the split plugin-dist is built THEN the updater chunks (update-helper-start, update-fetch-verify, release-verify, allowed-signers and what only they import) total below `LAZY_CAP` (`30000`) bytes', () => {
    expect(graph.lazyBytes).toBeLessThan(LAZY_CAP);
    expect(LAZY_CAP).toBe(30000);
  });

  it('3: WHEN the start set is read THEN no file in it is named `update-helper-start`, `update-fetch-verify`, `release-verify` or `allowed-signers`, and `update-helper-start` and `update-fetch-verify`, where they exist under src/core, are lazy chunks of their own', () => {
    expect(graph.start.size).toBeGreaterThan(3);
    const named = [...graph.start.keys()].filter((f) => UPDATER_MODULES.some((m) => path.basename(f).startsWith(`${m}-`)));
    expect(named).toEqual([]);
    // and every updater module that exists in src/core is still its own lazy chunk (a static import inlines it into the start set)
    const present = UPDATER_ENTRIES.filter((m) => fs.existsSync(path.join(process.cwd(), 'src', 'core', `${m}.ts`)));
    const lazyNames = [...graph.lazy.keys()].map((f) => path.basename(f));
    for (const m of present) expect(lazyNames.some((f) => f.startsWith(`${m}-`)), m).toBe(true);
  });

  it('4: WHEN a fake dist has a static import of `chunks/a.js` and a dynamic `import("./chunks/update-helper-start-X.js")` THEN the start set is cli.js, snote-main.js and chunks/a.js, and the lazy set is only the helper chunk and what only it imports', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-fake-dist-'));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, 'chunks'));
    fs.writeFileSync(path.join(dir, 'cli.js'), "await import('./snote-main.js');\n");
    fs.writeFileSync(path.join(dir, 'snote-main.js'), 'import { a } from "./chunks/a.js";\nimport("./chunks/update-helper-start-X.js");\nconst h = await import("./chunks/update-helper-start-X.js");\n');
    fs.writeFileSync(path.join(dir, 'chunks', 'a.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(dir, 'chunks', 'update-helper-start-X.js'), 'import { b } from "./b.js";\nexport const h = b;\n');
    fs.writeFileSync(path.join(dir, 'chunks', 'b.js'), 'export const b = 2;\n');
    const g = chunkGraph(dir);
    expect([...g.start.keys()].sort()).toEqual(['chunks/a.js', 'cli.js', 'snote-main.js']);
    expect([...g.lazy.keys()].sort()).toEqual(['chunks/b.js', 'chunks/update-helper-start-X.js']);
  });
});
