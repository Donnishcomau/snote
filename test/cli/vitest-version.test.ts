/**
 * T335: Upgrade vitest to the patched 4.1.11 release.
 */

import { readFileSync } from 'node:fs';

describe('vitest version (T335)', () => {
  it('1: WHEN `node_modules/vitest/package.json` is read THEN its version is `4.1.11`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/vitest/package.json', 'utf8'));
    expect(pkg.version).toBe('4.1.11');
  });

  it('2: WHEN `node_modules/@vitest/mocker/package.json` is read THEN its version is `4.1.11`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/@vitest/mocker/package.json', 'utf8'));
    expect(pkg.version).toBe('4.1.11');
  });

  it('3: WHEN `node_modules/uuid/package.json` is read THEN its version is `3.3.3`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/uuid/package.json', 'utf8'));
    expect(pkg.version).toBe('3.3.3');
  });
});
