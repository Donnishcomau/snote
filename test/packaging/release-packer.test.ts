/**
 * #441: the release has one packer. scripts/release-asset.sh (#852) writes the signed `snote-<version>.tar.gz` that the
 * direct installer and the Homebrew formula both install; the old `npm run pack` (scripts/pack.mjs, a bin/snote + .desktop
 * .tgz nothing consumed) is retired, not kept as a second packer. The AUR PKGBUILD assertions the old pack tests held stay here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('#441 one release packer', () => {
  it('1: WHEN package.json and scripts/ are read THEN there is no `pack` script, `scripts.build` is still `node scripts/build.mjs`, and `scripts/pack.mjs` does not exist', () => {
    expect(Object.keys(PKG.scripts)).not.toContain('pack');
    expect(PKG.scripts.build).toBe('node scripts/build.mjs');
    expect(existsSync(join(ROOT, 'scripts', 'pack.mjs'))).toBe(false);
  });

  it('2: WHEN packaging/aur/PKGBUILD is read THEN it holds the required fields, `$pkgdir/usr/lib/snote/snote-main.js` and `ln -s /usr/lib/snote/cli.js "$pkgdir/usr/bin/snote"`, and its pkgver equals the package.json version', () => {
    const content = readFileSync(join(ROOT, 'packaging', 'aur', 'PKGBUILD'), 'utf8');
    expect(content).toContain('pkgname=snote');
    expect(content).toContain("depends=('nodejs>=22' 'hicolor-icon-theme')");
    expect(content).toContain('npm run build');
    expect(content).toContain('$pkgdir/usr/bin/snote');
    expect(content).toContain('$pkgdir/usr/share/applications/snote.desktop');
    expect(content).toContain('$pkgdir/usr/lib/snote/snote-main.js');
    expect(content).toContain('ln -s /usr/lib/snote/cli.js "$pkgdir/usr/bin/snote"');
    const pkgver = content.match(/^pkgver=(.+)$/m);
    expect(pkgver).not.toBeNull();
    expect(pkgver![1]).toBe(PKG.version);
  });
});

// The security surface lists of the private tree (the public export has no scripts/release-gate.sh, so this block is skipped there)
const GATE = join(ROOT, 'scripts', 'release-gate.sh');
describe.skipIf(!existsSync(GATE))('#441 the security surface lists name no retired path', () => {
  it('3: WHEN SHIPPED in scripts/release-gate.sh and the paths of test/fixtures/security-surfaces.json are read THEN every path they name exists in the tree (#441 review)', () => {
    const m = /^SHIPPED=\(([^)]*)\)/m.exec(readFileSync(GATE, 'utf8'));
    const shipped = m ? (m[1] as string).split(/\s+/).filter(Boolean) : [];
    const surfaces = (JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'security-surfaces.json'), 'utf8')) as { paths: string[] }).paths;
    const listed = [...new Set([...shipped, ...surfaces])];
    expect([listed.length >= 10, listed.filter((p) => !existsSync(join(ROOT, p)))]).toEqual([true, []]);
  });
});
