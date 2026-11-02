/**
 * diet2 (#30): the login requests (src/core/auth.ts) load with `import()` on the first login call,
 * so a signed-in start does not parse them and the start set has room for the one-key update.
 * When that chunk cannot be loaded, the login call fails like a network error: a rejected
 * promise the login screen already shows, never a crash (test/cli/login-chunk-failure.test.ts).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSplitDist, chunkGraph, type ChunkGraph } from '../helpers/bundle-size';

const LOGIN_FUNCTIONS = ['requestLoginCode', 'completeLogin', 'loginWithPassword'];
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

describe('diet2: the login requests are not in the start set', () => {
  it('1: WHEN the split plugin-dist is built THEN no start-set file defines `requestLoginCode`, `completeLogin` or `loginWithPassword`, and each is defined in `1` chunk outside the start set', () => {
    expect(graph.start.has('snote-main.js')).toBe(true);
    const startText = [...graph.start.keys()].map((rel) => fs.readFileSync(path.join(dist, rel), 'utf8'));
    const lazyText = fs.readdirSync(path.join(dist, 'chunks')).filter((f) => !graph.start.has(path.join('chunks', f))).map((f) => fs.readFileSync(path.join(dist, 'chunks', f), 'utf8'));
    for (const name of LOGIN_FUNCTIONS) {
      expect(startText.filter((t) => defines(t, name)).length, `${name} in the start set`).toBe(0);
      expect(lazyText.filter((t) => defines(t, name)).length, `${name} in a lazy chunk`).toBe(1);
    }
  });

  it('2: WHEN src is scanned THEN no file imports `core/auth` statically (a type-only import is allowed), and `src/cli/login-calls.ts` loads it with `import(`', () => {
    const root = path.join(process.cwd(), 'src');
    const staticRe = /^\s*import\s+(?!type\b)[^;]*?from\s+['"][./]+(?:core\/)?auth(?:\.js)?['"]/m;
    const eager = srcFiles(root).filter((f) => staticRe.test(fs.readFileSync(f, 'utf8')));
    expect(eager.map((f) => path.relative(root, f))).toEqual([]);
    expect(/import\(\s*['"]\.\.\/core\/auth['"]\s*\)/.test(fs.readFileSync(path.join(root, 'cli', 'login-calls.ts'), 'utf8'))).toBe(true);
  });

  it('4: WHEN the split plugin-dist is built THEN the chunk that defines `requestLoginCode` is reached from the start set only by a string-literal `import("./chunks/...")`, it is listed in `SHA256SUMS`, and every `import(` in a start-set file has one string-literal argument starting `./`, `../` or `node:`', () => {
    const lazy = fs.readdirSync(path.join(dist, 'chunks')).filter((f) => /function requestLoginCode\d*\(/.test(fs.readFileSync(path.join(dist, 'chunks', f), 'utf8')));
    expect(lazy.length).toBe(1);
    const rel = `chunks/${lazy[0]}`;
    const args = [...graph.start.keys()].flatMap((f) => [...fs.readFileSync(path.join(dist, f), 'utf8').matchAll(/\bimport\(([^)]*)\)/g)].map((m) => m[1].replace(/\/\*[^]*?\*\//g, "").trim()));
    const nonLiteral = args.filter((a) => !/^(["'])(\.\.?\/|node:)[^"'`$]*\1$/.test(a));
    const refs = args.filter((a) => a.includes(lazy[0]));
    expect({ nonLiteral, refs, summed: fs.readFileSync(path.join(dist, 'SHA256SUMS'), 'utf8').split('\n').some((l) => l.endsWith(`  ${rel}`)) })
      .toEqual({ nonLiteral: [], refs: [`"./${rel}"`], summed: true });
  });
});
