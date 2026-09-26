import { describe, it, expect, afterEach } from 'vitest';
import {
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { packList, makeTarball } from '../../scripts/pack.mjs';

const PKG_PATH = join(process.cwd(), 'package.json');

describe('packaging pack', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1: WHEN packList is called THEN name is "snote-{version}" and files has 3 pairs with correct from/to', () => {
    const result = packList('1.2.3');

    expect(result.name).toBe('snote-1.2.3');
    expect(result.files).toHaveLength(3);

    const pairs = result.files as [string, string][];
    expect(pairs[0]).toEqual(['dist/cli.js', 'bin/snote']);
    expect(pairs[1][1]).toBe('share/applications/snote.desktop');
    expect(pairs[2][1]).toBe('share/licenses/snote/LICENSE');
  });

  it('2: WHEN package.json is read THEN scripts.pack is "node scripts/pack.mjs" and scripts.build is still "node scripts/build.mjs"', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    expect(pkg.scripts.pack).toBe('node scripts/pack.mjs');
    expect(pkg.scripts.build).toBe('node scripts/build.mjs');
  });

  it('3: WHEN PKGBUILD is read THEN it contains required fields and pkgver equals package.json version', () => {
    const pkgPath = join(process.cwd(), 'packaging', 'aur', 'PKGBUILD');
    const content = readFileSync(pkgPath, 'utf8');

    expect(content).toContain('pkgname=snote');
    expect(content).toContain("depends=('nodejs>=22')");
    expect(content).toContain('npm run build');
    expect(content).toContain('$pkgdir/usr/bin/snote');
    expect(content).toContain('$pkgdir/usr/share/applications/snote.desktop');

    const pkgJson = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    const pkgverMatch = content.match(/^pkgver=(.+)$/m);
    expect(pkgverMatch).not.toBeNull();
    expect(pkgverMatch![1]).toBe(pkgJson.version);
  });

  it('4: WHEN every from path of packList except dist/cli.js is checked THEN the files exist in the repo', () => {
    const result = packList('1.2.3');
    const pairs = result.files as [string, string][];

    for (const [from] of pairs) {
      if (from === 'dist/cli.js') continue;
      const fullPath = join(process.cwd(), from);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  it('5: WHEN makeTarball is called THEN the returned path ends in snote-9.9.9.tgz and exists, listing has expected paths and no node_modules', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pack-test-'));
    const stageDir = join(tmpDir, 'stage');
    const outDir = join(tmpDir, 'out');
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    const bundle = join(tmpDir, 'bundle.js');
    writeFileSync(bundle, '#!/usr/bin/env node\nconsole.log("test")');

    const tarballPath = makeTarball({
      version: '9.9.9',
      bundle,
      stageDir,
      outDir,
    });

    expect(tarballPath).toContain('snote-9.9.9.tgz');
    expect(existsSync(tarballPath)).toBe(true);

    const listing = spawnSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' }).stdout;
    expect(listing).toContain('snote-9.9.9/bin/snote');
    expect(listing).toContain('snote-9.9.9/share/licenses/snote/LICENSE');
    expect(listing).not.toContain('node_modules');
  });

  it('6: WHEN makeTarball is called with a bundle path that does not exist THEN it throws an error containing "run npm run build first" and the temp dir is still empty', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pack-test-'));

    const bundle = join(tmpDir, 'nonexistent-bundle.js');
    const stageDir = join(tmpDir, 'stage');
    const outDir = join(tmpDir, 'out');

    expect(() =>
      makeTarball({
        version: '1.0.0',
        bundle,
        stageDir,
        outDir,
      })
    ).toThrow('run npm run build first');

    const entries = readdirSync(tmpDir);
    expect(entries).toEqual([]);
  });
});
