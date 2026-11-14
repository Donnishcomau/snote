import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSplitDist, chunkGraph, type ChunkGraph } from '../helpers/bundle-size';

const MARKER = 'user/starred/Donnishcomau/snote';
const PROMPT = 'Enjoying snote? s: star it on GitHub, using your GitHub CLI';
let dist = '';
let graph: ChunkGraph;
const dirs: string[] = [];

beforeAll(async () => {
  dist = await buildSplitDist();
  dirs.push(dist);
  graph = chunkGraph(dist);
}, 60000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('star prompt is a lazy chunk', () => {
  it('8: WHEN the split bundle is built THEN star-prompt and StarPrompt are not in the start set and are in dynamic chunks', () => {
    const startText = [...graph.start.keys()].map((rel) => fs.readFileSync(path.join(dist, rel), 'utf8'));
    const chunks = fs.readdirSync(path.join(dist, 'chunks'));
    const lazy = chunks.filter((f) => !graph.start.has(path.join('chunks', f)));
    const lazyText = lazy.map((f) => fs.readFileSync(path.join(dist, 'chunks', f), 'utf8'));
    expect(startText.some((t) => t.includes(MARKER) || t.includes(PROMPT))).toBe(false);
    const holders = lazy.filter((_f, i) => lazyText[i].includes(MARKER) && lazyText[i].includes(PROMPT));
    expect(holders.length).toBeGreaterThan(0);
    const root = path.join(process.cwd(), 'src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (fs.statSync(abs).isDirectory()) walk(abs);
        else if (/\.tsx?$/.test(name)) files.push(abs);
      }
    };
    walk(root);
    const staticStar = /^\s*import\s+(?!type\b)[^;]*from\s+['"][^'"]*star-prompt(?:\.js)?['"]/m;
    const eager = files.filter((f) => staticStar.test(fs.readFileSync(f, 'utf8')));
    expect(eager.map((f) => path.relative(root, f))).toEqual([path.join('tui', 'StarPrompt.tsx')]);
    expect(fs.readFileSync(path.join(root, 'cli', 'main.tsx'), 'utf8')).toContain("import('../core/star-prompt')");
    expect(fs.readFileSync(path.join(root, 'tui', 'App.tsx'), 'utf8')).toContain("import('./StarPrompt')");
  });
});
