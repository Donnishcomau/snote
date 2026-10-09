import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKGBUILD_PATH = join(process.cwd(), 'packaging', 'aur', 'PKGBUILD');

const pkgbuild = () => readFileSync(PKGBUILD_PATH, 'utf8');

describe('pkgbuild namcap', () => {
  it("1: WHEN packaging/aur/PKGBUILD is read THEN it contains depends=('nodejs>=22' 'hicolor-icon-theme')", () => {
    expect(pkgbuild()).toContain("depends=('nodejs>=22' 'hicolor-icon-theme')");
  });

  it('2: WHEN packaging/aur/PKGBUILD is read THEN it contains source=("$pkgname-$pkgver.tar.gz::https://github.com/donnishcomau/snote/archive/refs/tags/v$pkgver.tar.gz")', () => {
    expect(pkgbuild()).toContain(
      'source=("$pkgname-$pkgver.tar.gz::https://github.com/donnishcomau/snote/archive/refs/tags/v$pkgver.tar.gz")'
    );
  });

  it('3: WHEN packaging/aur/PKGBUILD is read THEN it still contains pkgver=0.2.5, sha256sums=(\'SKIP\') and cd "$srcdir/snote-$pkgver"', () => {
    const content = pkgbuild();
    expect(content).toContain('pkgver=0.2.5');
    expect(content).toContain("sha256sums=('SKIP')");
    expect(content).toContain('cd "$srcdir/snote-$pkgver"');
  });
});
