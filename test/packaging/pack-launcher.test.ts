import { describe, it, expect, afterEach } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { makeTarball } from '../../scripts/pack.mjs';

describe('packaging pack-launcher', () => {
  let tmpDir: string;

  // Fixture: build/cli.js (launcher) + build/snote-main.js (real bundle)
  const setup = () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pack-launcher-'));
    const buildDir = join(tmpDir, 'build');
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, 'cli.js'), "#!/usr/bin/env node\nawait import('./snote-main.js');\n");
    writeFileSync(join(buildDir, 'snote-main.js'), "console.log('packed main ran');\n");
    const stageDir = join(tmpDir, 'stage');
    const outDir = join(tmpDir, 'out');
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    return { buildDir, stageDir, outDir };
  };

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1: WHEN makeTarball is called with bundle = <tmp>/build/cli.js THEN the tarball listing contains snote-9.9.9/bin/snote and snote-9.9.9/bin/snote-main.js', () => {
    const { buildDir, stageDir, outDir } = setup();

    const tarballPath = makeTarball({
      version: '9.9.9',
      bundle: join(buildDir, 'cli.js'),
      stageDir,
      outDir,
    });

    const listing = spawnSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' }).stdout;
    expect(listing).toContain('snote-9.9.9/bin/snote');
    expect(listing).toContain('snote-9.9.9/bin/snote-main.js');
  });

  it('2: WHEN that tarball is unpacked with tar -xzf into <tmp>/unpacked and bin/snote is run with spawnSync(process.execPath, [file], { encoding: "utf8" }) THEN the exit status is 0 and stdout contains packed main ran', () => {
    const { buildDir, stageDir, outDir } = setup();

    const tarballPath = makeTarball({
      version: '9.9.9',
      bundle: join(buildDir, 'cli.js'),
      stageDir,
      outDir,
    });

    const unpacked = join(tmpDir, 'unpacked');
    mkdirSync(unpacked, { recursive: true });
    spawnSync('tar', ['-xzf', tarballPath, '-C', unpacked]);

    const result = spawnSync(process.execPath, [join(unpacked, 'snote-9.9.9', 'bin', 'snote')], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('packed main ran');
  });

  it('3: WHEN stageDir holds the extra file keep.txt before the call THEN after makeTarball the file keep.txt still exists (only snote-9.9.9 inside the stage dir is replaced)', () => {
    const { buildDir, stageDir, outDir } = setup();
    const keep = join(stageDir, 'keep.txt');
    writeFileSync(keep, 'keep me');

    makeTarball({
      version: '9.9.9',
      bundle: join(buildDir, 'cli.js'),
      stageDir,
      outDir,
    });

    expect(existsSync(keep)).toBe(true);
  });

  it('4: WHEN build/snote-main.js is deleted before the call THEN makeTarball throws an error containing run npm run build first and <tmp>/out is still empty', () => {
    const { buildDir, stageDir, outDir } = setup();
    rmSync(join(buildDir, 'snote-main.js'));

    expect(() =>
      makeTarball({
        version: '9.9.9',
        bundle: join(buildDir, 'cli.js'),
        stageDir,
        outDir,
      })
    ).toThrow('run npm run build first');

    expect(readdirSync(outDir)).toEqual([]);
  });

  it('5: WHEN bundle is a file whose text is console.log(1) with no snote-main.js next to it THEN makeTarball succeeds and the listing contains bin/snote and does not contain snote-main.js', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pack-launcher-'));
    const bundle = join(tmpDir, 'plain.js');
    writeFileSync(bundle, 'console.log(1)');
    const stageDir = join(tmpDir, 'stage');
    const outDir = join(tmpDir, 'out');
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    const tarballPath = makeTarball({
      version: '9.9.9',
      bundle,
      stageDir,
      outDir,
    });

    const listing = spawnSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' }).stdout;
    expect(listing).toContain('bin/snote');
    expect(listing).not.toContain('snote-main.js');
  });

  it('6: WHEN packaging/aur/PKGBUILD and scripts/pack.mjs are read THEN the first contains $pkgdir/usr/lib/snote/snote-main.js and ln -s /usr/lib/snote/cli.js "$pkgdir/usr/bin/snote", and the second contains stageDir: \'dist/stage\'', () => {
    const pkgbuild = readFileSync(join(process.cwd(), 'packaging', 'aur', 'PKGBUILD'), 'utf8');
    const pack = readFileSync(join(process.cwd(), 'scripts', 'pack.mjs'), 'utf8');

    expect(pkgbuild).toContain('$pkgdir/usr/lib/snote/snote-main.js');
    expect(pkgbuild).toContain('ln -s /usr/lib/snote/cli.js "$pkgdir/usr/bin/snote"');
    expect(pack).toContain("stageDir: 'dist/stage'");
  });
});
