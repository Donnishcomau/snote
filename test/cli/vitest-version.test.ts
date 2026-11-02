/**
 * Upgrade vitest to the patched 4.1.12 release.
 */

import { readFileSync } from 'node:fs';

describe('vitest version', () => {
  it('1: WHEN `node_modules/vitest/package.json` is read THEN its version is `4.1.12`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/vitest/package.json', 'utf8'));
    expect(pkg.version).toBe('4.1.12');
  });

  it('2: WHEN `node_modules/@vitest/mocker/package.json` is read THEN its version is `4.1.12`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/@vitest/mocker/package.json', 'utf8'));
    expect(pkg.version).toBe('4.1.12');
  });

  it('3: WHEN `node_modules/uuid/package.json` is read THEN its version is `3.3.3`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/uuid/package.json', 'utf8'));
    expect(pkg.version).toBe('3.3.3');
  });

  it('4: WHEN `node_modules/vite/package.json` is read THEN its version is `7.3.7`', () => {
    const pkg = JSON.parse(readFileSync('node_modules/vite/package.json', 'utf8'));
    expect(pkg.version).toBe('7.3.7');
  });

  it('5: WHEN `package-lock.json` is read THEN its `node_modules/vitest` and `node_modules/@vitest/mocker` entries are `4.1.12`, its `node_modules/vite` entry is `7.3.7`, and no entry whose key ends in `/node_modules/vite` exists', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const packages = lock.packages as Record<string, { version: string }>;
    expect(packages['node_modules/vitest'].version).toBe('4.1.12');
    expect(packages['node_modules/@vitest/mocker'].version).toBe('4.1.12');
    expect(packages['node_modules/vite'].version).toBe('7.3.7');
    expect(Object.keys(packages).filter((k) => k.endsWith('/node_modules/vite'))).toEqual([]);
  });
});
