/**
 * T334: Bump the direct esbuild dependency past the advisory.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bundle } from '../../scripts/build.mjs';

describe('esbuild version (T334)', () => {
  it('1: WHEN `node_modules/esbuild/package.json` is read THEN its version is `0.28.2`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/esbuild/package.json', 'utf8'));
    expect(pkg.version).toBe('0.28.2');
  });

  it('2: WHEN `package.json` is read THEN the `esbuild` dependency is `0.28.2`', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.devDependencies?.esbuild ?? pkg.dependencies?.esbuild).toBe('0.28.2');
  });

  it('3: WHEN `bundle` from `scripts/build.mjs` builds `src/cli/index.ts` into a temp file THEN that file exists and its size is greater than `0`', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'esbuild-test-'));
    const outfile = join(dir, 'test-bundle.js');
    try {
      await bundle({ entry: 'src/cli/index.ts', outfile });
      expect(existsSync(outfile)).toBe(true);
      expect(statSync(outfile).size).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
