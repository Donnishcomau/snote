import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('T407 bundle size cap raised to 1,540,000', () => {
  it('1: WHEN test/cli/bundle-size.test.ts is read THEN it contains `toBeLessThan(1540000)` and `raised to 1,540,000`, does not contain the text `1500000`, and still contains `ws/lib` and `usage: snote`.', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'test/cli/bundle-size.test.ts'),
      'utf8'
    );
    expect(content).toContain('toBeLessThan(1540000)');
    expect(content).toContain('raised to 1,540,000');
    expect(content).not.toContain('1500000');
    expect(content).toContain('ws/lib');
    expect(content).toContain('usage: snote');
  });
});
