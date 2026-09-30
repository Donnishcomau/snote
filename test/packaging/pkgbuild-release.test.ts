import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKGBUILD_PATH = join(process.cwd(), 'packaging', 'aur', 'PKGBUILD');
const PKG_PATH = join(process.cwd(), 'package.json');

const pkgbuild = () => readFileSync(PKGBUILD_PATH, 'utf8');

describe('pkgbuild release', () => {
  it('1: WHEN packaging/aur/PKGBUILD is read THEN it contains pkgver=0.1.3 and pkgrel=1', () => {
    const content = pkgbuild();
    expect(content).toContain('pkgver=0.1.3');
    expect(content).toContain('pkgrel=1');
  });

  it('2: WHEN packaging/aur/PKGBUILD is read THEN it contains url="https://github.com/donnishcomau/snote" and the maintainer line qteamdon <201689496+qteamdon@users.noreply.github.com>', () => {
    const content = pkgbuild();
    expect(content).toContain('url="https://github.com/donnishcomau/snote"');
    expect(content).toContain(
      '# Maintainer: qteamdon <201689496+qteamdon@users.noreply.github.com>'
    );
  });

  it('3: WHEN packaging/aur/PKGBUILD is read THEN it contains https://github.com/donnishcomau/snote/archive/refs/tags/v$pkgver.tar.gz', () => {
    const content = pkgbuild();
    expect(content).toContain(
      'https://github.com/donnishcomau/snote/archive/refs/tags/v$pkgver.tar.gz'
    );
  });

  it("4: WHEN packaging/aur/PKGBUILD is read THEN it contains sha256sums=('SKIP') and a # comment line containing sha256", () => {
    const content = pkgbuild();
    expect(content).toContain("sha256sums=('SKIP')");
    const commentWithSha = content
      .split('\n')
      .some((line) => line.trimStart().startsWith('#') && line.includes('sha256'));
    expect(commentWithSha).toBe(true);
  });

  it('5: WHEN packaging/aur/PKGBUILD is read THEN it contains cd "$srcdir/snote-$pkgver"', () => {
    const content = pkgbuild();
    expect(content).toContain('cd "$srcdir/snote-$pkgver"');
  });

  it('6: WHEN package.json is read THEN its version field is 0.1.3', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    expect(pkg.version).toBe('0.1.3');
  });
});
