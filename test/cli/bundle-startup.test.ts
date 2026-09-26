/**
 * T172: the bundle must not build Unicode tables or load undici at start-up.
 * The lazyIcu esbuild plugin rewrites Intl.Segmenter / \p{RGI_Emoji} / the
 * yoga fetch-shim in the BUNDLE only; this test proves frames rendered
 * through the bundle match the unbundled libraries exactly.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { frames } from '../fixtures/bundle-frame-entry';

const ENTRY = 'test/fixtures/bundle-frame-entry.tsx';

let outfile: string;
let outDir: string;
let status: number | null;
let stdout: string;

describe('T172 lazy ICU in bundle', () => {
  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'bundle-startup-'));
    outfile = join(outDir, 'entry.js');
    await bundle({ entry: ENTRY, outfile });
    const result = spawnSync(process.execPath, [outfile, 'print'], {
      encoding: 'utf8',
    });
    status = result.status;
    stdout = result.stdout;
  }, 20000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('1: WHEN the bundled fixture is run with print THEN the exit status is 0 and the parsed stdout equals (toEqual) the array that frames() returns when the fixture is imported in the test', () => {
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual(frames());
  });

  it('2: WHEN that array is read THEN entry 0 is `plain ascii line th…`, entry 1 starts with `héllo wörld` and entry 2 starts with `ok 👍🏽 family`', () => {
    const arr = frames();
    expect(arr[0]).toBe('plain ascii line th…');
    expect(arr[1].startsWith('héllo wörld')).toBe(true);
    expect(arr[2].startsWith('ok 👍🏽 family')).toBe(true);
  });

  it('3: WHEN the bundled text is read THEN it contains `__asciiSegments`, and it matches neither /^var \\w+ = new Intl\\.Segmenter\\(/m nor /^var rgiEmojiRegex = (new RegExp|\\/)/m', () => {
    const bundled = readFileSync(outfile, 'utf8');
    expect(bundled).toContain('__asciiSegments');
    expect(bundled).not.toMatch(/^var \w+ = new Intl\.Segmenter\(/m);
    expect(bundled).not.toMatch(/^var rgiEmojiRegex = (new RegExp|\/)/m);
  });

  it('4: WHEN the bundled text is read THEN it does not contain `typeof fetch` and still contains `WebAssembly.instantiate`', () => {
    const bundled = readFileSync(outfile, 'utf8');
    expect(bundled).not.toContain('typeof fetch');
    expect(bundled).toContain('WebAssembly.instantiate');
  });

  it('5: WHEN scripts/build.mjs is read THEN it contains `function lazyIcu(`, `noDevtools(), simperiumInterop(), lazyIcu()` and does not contain `minify`', () => {
    const script = readFileSync('scripts/build.mjs', 'utf8');
    expect(script).toContain('function lazyIcu(');
    expect(script).toContain('noDevtools(), simperiumInterop(), lazyIcu()');
    expect(script).not.toContain('minify');
  });
});
