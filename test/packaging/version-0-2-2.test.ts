// T367 — version 0.2.3 everywhere the version is pinned (release 0.2.3).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('version 0.2.3', () => {
  it('1: WHEN package.json and manifest.json are parsed THEN both version fields equal 0.2.3', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('manifest.json')) as { version: string };
    expect(pkg.version).toBe('0.2.3');
    expect(manifest.version).toBe('0.2.3');
  });

  it("2: WHEN package-lock.json is parsed THEN version and packages[''].version both equal 0.2.3", () => {
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect(lock.version).toBe('0.2.3');
    expect(lock.packages[''].version).toBe('0.2.3');
  });

  it('3: WHEN packaging/aur/PKGBUILD is read THEN it contains pkgver=0.2.3 and pkgrel=1 and not pkgver=0.2.1', () => {
    const content = read('packaging', 'aur', 'PKGBUILD');
    expect(content).toContain('pkgver=0.2.3');
    expect(content).toContain('pkgrel=1');
    expect(content).not.toContain('pkgver=0.2.1');
  });
});
