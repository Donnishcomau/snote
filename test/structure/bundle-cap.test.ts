import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('chunk-keys slice 2: one bundle size cap, shared', () => {
  it('1: WHEN test/helpers/bundle-size.ts, test/cli/bundle-size.test.ts and test/vendor/preview-cache-bound.test.ts are read THEN the helper contains `BUNDLE_CAP = 1600000`, each test contains `bundleSize(` and `BUNDLE_CAP` and contains neither `1545000` nor `statSync(outfile).size`, and bundle-size.test.ts still contains `ws/lib` and `usage: snote`', () => {
    expect(read('test/helpers/bundle-size.ts')).toContain('BUNDLE_CAP = 1600000');
    for (const file of ['test/cli/bundle-size.test.ts', 'test/vendor/preview-cache-bound.test.ts']) {
      const content = read(file);
      expect({ file, has: content.includes('bundleSize(') && content.includes('BUNDLE_CAP') }).toEqual({ file, has: true });
      expect({ file, old: content.includes('1545000') || content.includes('statSync(outfile).size') }).toEqual({
        file,
        old: false,
      });
    }
    const sizeTest = read('test/cli/bundle-size.test.ts');
    expect(sizeTest).toContain('ws/lib');
    expect(sizeTest).toContain('usage: snote');
  });
});
