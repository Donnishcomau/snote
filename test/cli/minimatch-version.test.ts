/**
 * #595: the dev tools resolve minimatch 11.0.1 or later (GHSA-g3hv-75wg-m249).
 */

import { readFileSync } from 'node:fs';

function atLeast(version: string, major: number, minor: number, patch: number): boolean {
  const [a = 0, b = 0, c = 0] = version.split('.').map((n) => parseInt(n, 10));
  if (a !== major) return a > major;
  if (b !== minor) return b > minor;
  return c >= patch;
}

describe('minimatch version (#595)', () => {
  it("1: WHEN `package.json` is read THEN `overrides` equals `{ minimatch: '^11.0.1' }`", () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.overrides).toEqual({ minimatch: '^11.0.1' });
  });

  it('2: WHEN `package-lock.json` is read THEN every `node_modules/minimatch` entry is 11.0.1 or later and at least one exists', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const packages = lock.packages as Record<string, { version: string }>;
    const keys = Object.keys(packages).filter(
      (k) => k === 'node_modules/minimatch' || k.endsWith('/node_modules/minimatch'),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(atLeast(packages[k].version, 11, 0, 1), `${k} ${packages[k].version}`).toBe(true);
    }
  });

  it('3: WHEN the installed minimatch `package.json` is read THEN its version is 11.0.1 or later', () => {
    const pkg = JSON.parse(readFileSync('node_modules/minimatch/package.json', 'utf8'));
    expect(atLeast(pkg.version, 11, 0, 1)).toBe(true);
  });

  it('4: WHEN `package-lock.json` is read THEN no key ends in `/node_modules/minimatch` (one copy)', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    expect(Object.keys(lock.packages).filter((k) => k.endsWith('/node_modules/minimatch'))).toEqual([]);
  });
});
