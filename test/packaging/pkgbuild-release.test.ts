import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKGBUILD_PATH = join(process.cwd(), 'packaging', 'aur', 'PKGBUILD');
const PKG_PATH = join(process.cwd(), 'package.json');

const pkgbuild = () => readFileSync(PKGBUILD_PATH, 'utf8');

describe('pkgbuild release', () => {
  it('1: WHEN packaging/aur/PKGBUILD is read THEN it contains pkgver=0.2.12 and pkgrel=1', () => {
    const content = pkgbuild();
    expect(content).toContain('pkgver=0.2.12');
    expect(content).toContain('pkgrel=1');
  });

  it('2: WHEN packaging/aur/PKGBUILD is read THEN it contains url="https://github.com/donnishcomau/snote" and the maintainer line qteamdon <201689496+qteamdon@users.noreply.github.com>', () => {
    const content = pkgbuild();
    expect(content).toContain('url="https://github.com/donnishcomau/snote"');
    expect(content).toContain(
      '# Maintainer: qteamdon <201689496+qteamdon@users.noreply.github.com>'
    );
  });

  it('3: WHEN packaging/aur/PKGBUILD is read THEN it contains no `archive/refs/tags` URL and its prepare() runs `git -C "$top" archive` of `HEAD` (#876)', () => {
    const content = pkgbuild();
    expect(content).not.toContain('archive/refs/tags');
    expect(content).toContain('git -C "$top" archive --format=tar --prefix="snote-$pkgver/" -o "$srcdir/snote-$pkgver.tar" HEAD');
  });

  it('4: WHEN packaging/aur/PKGBUILD is read THEN it contains sha256sums=() and a # comment line naming #876 and the clone (#876)', () => {
    const content = pkgbuild();
    expect(content).toContain('sha256sums=()');
    const comment = content
      .split('\n')
      .some((line) => line.trimStart().startsWith('#') && line.includes('#876') && line.includes('clone'));
    expect(comment).toBe(true);
  });

  it('5: WHEN packaging/aur/PKGBUILD is read THEN it contains cd "$srcdir/snote-$pkgver"', () => {
    const content = pkgbuild();
    expect(content).toContain('cd "$srcdir/snote-$pkgver"');
  });

  it('6: WHEN package.json is read THEN its version field is 0.2.12', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    expect(pkg.version).toBe('0.2.12');
  });
});
