import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKGBUILD_PATH = join(process.cwd(), 'packaging', 'aur', 'PKGBUILD');

const pkgbuild = () => readFileSync(PKGBUILD_PATH, 'utf8');

describe('pkgbuild namcap', () => {
  it("1: WHEN packaging/aur/PKGBUILD is read THEN it contains depends=('nodejs>=22' 'hicolor-icon-theme')", () => {
    expect(pkgbuild()).toContain("depends=('nodejs>=22' 'hicolor-icon-theme')");
  });

  it('2: WHEN packaging/aur/PKGBUILD is read THEN it contains the line source=() and no line that sets source to anything else (#876)', () => {
    const lines = pkgbuild().split('\n');
    expect(lines).toContain('source=()');
    expect(lines.filter((l) => /^\s*source(_\w+)?\+?=/.test(l))).toEqual(['source=()']);
  });

  it('3: WHEN packaging/aur/PKGBUILD is read THEN it still contains pkgver=0.2.12, sha256sums=() and cd "$srcdir/snote-$pkgver", and no SKIP (#876)', () => {
    const content = pkgbuild();
    expect(content).toContain('pkgver=0.2.12');
    expect(content).toContain('sha256sums=()');
    expect(content).not.toContain('SKIP');
    expect(content).toContain('cd "$srcdir/snote-$pkgver"');
  });
});
