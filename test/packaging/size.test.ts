import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { bundle } from '../../scripts/build.mjs';

const PKG_PATH = join(process.cwd(), 'package.json');
const DESKTOP_PATH = join(process.cwd(), 'packaging', 'omarchy', 'snote.desktop');
const LICENSE_PATH = join(process.cwd(), 'LICENSE');

const LIMIT = 40 * 1024 * 1024;

describe('install size gate', () => {
  let dir: string;
  let outfile: string;
  let help: ReturnType<typeof spawnSync>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-size-'));
    outfile = join(dir, 'snote.js');
    await bundle({ entry: 'src/cli/index.ts', outfile });
    // Run from the temp dir, where no node_modules can be found:
    // only a self-contained bundle starts.
    help = spawnSync(process.execPath, [outfile, '--help'], {
      encoding: 'utf8',
      cwd: dir,
    });
    const mb = (installSize() / (1024 * 1024)).toFixed(1);
    console.log(`install size: ${mb} MB (limit 40 MB)`);
  }, 20000);

  afterAll(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function installSize(): number {
    return (
      statSync(outfile).size + statSync(DESKTOP_PATH).size + statSync(LICENSE_PATH).size
    );
  }

  it('1: WHEN the bundle has been built THEN the file exists, its first line is "#!/usr/bin/env node", and its size is above 100000 bytes', () => {
    expect(existsSync(outfile)).toBe(true);
    const firstLine = readFileSync(outfile, 'utf8').split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
    expect(statSync(outfile).size).toBeGreaterThan(100000);
  });

  it('2: WHEN the bundle is run with --help from the temp dir THEN the exit status is 0 and stdout contains "usage: snote"', () => {
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('usage: snote');
  });

  it('3: WHEN the sizes of the bundle, packaging/omarchy/snote.desktop and LICENSE are added THEN each of the three is above 0 and the sum is below LIMIT, which equals 40 * 1024 * 1024', () => {
    expect(LIMIT).toBe(40 * 1024 * 1024);
    expect(statSync(outfile).size).toBeGreaterThan(0);
    expect(statSync(DESKTOP_PATH).size).toBeGreaterThan(0);
    expect(statSync(LICENSE_PATH).size).toBeGreaterThan(0);
    expect(installSize()).toBeLessThan(LIMIT);
  });

  it('4: WHEN package.json is read THEN scripts.size is "vitest run test/packaging/size.test.ts" and scripts.build is still "node scripts/build.mjs"', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    expect(pkg.scripts.size).toBe('vitest run test/packaging/size.test.ts');
    expect(pkg.scripts.build).toBe('node scripts/build.mjs');
  });
});
