/**
 * T341: `npm run build:plugin` produces the pre-built plugin distribution:
 * readable .js chunks small enough for the marketplace scanner, a cli.js
 * launcher that runs, no package-manager strings, byte-identical rebuilds,
 * and a VERSION file.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';

const MAX_FILE = 500000;
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

/** Every file under `dir`, as { abs, rel } pairs, recursing into folders. */
function listFiles(dir: string, base = dir): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(abs, base));
    } else {
      out.push({ abs, rel: relative(base, abs) });
    }
  }
  return out;
}

describe('T341 buildPluginDist output', () => {
  let dirA: string;
  let dirB: string;
  const dirs: string[] = [];

  beforeAll(async () => {
    dirA = mkdtempSync(join(tmpdir(), 'plugin-dist-a-'));
    dirs.push(dirA);
    await buildPluginDist(dirA);
  }, 20000);

  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('1: WHEN buildPluginDist has built into a temp directory THEN every file in it (recursively) is smaller than `500000` bytes and there are at least `5` files ending in `.js`', () => {
    const files = listFiles(dirA);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(statSync(f.abs).size).toBeLessThan(MAX_FILE);
    }
    const js = files.filter((f) => f.rel.endsWith('.js'));
    expect(js.length).toBeGreaterThanOrEqual(5);
  });

  it("2: WHEN cli.js from that directory is run with spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }) THEN the exit status is `0` and stdout is `snote ` followed by the `version` in `package.json` and a newline", () => {
    const run = spawnSync(
      process.execPath,
      [join(dirA, 'cli.js'), '--version'],
      { encoding: 'utf8' }
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`snote ${pkg.version}\n`);
  });

  it('3: WHEN every `.js` file in that directory is read as text THEN none contains `Run npm install` and none contains `ws/lib`', () => {
    for (const f of listFiles(dirA)) {
      if (!f.rel.endsWith('.js')) continue;
      const text = readFileSync(f.abs, 'utf8');
      expect(text).not.toContain('Run npm install');
      expect(text).not.toContain('ws/lib');
    }
  });

  it('4: WHEN buildPluginDist is run a second time into another temp directory THEN the two directories hold the same relative file names and each pair of files is byte-identical', async () => {
    dirB = mkdtempSync(join(tmpdir(), 'plugin-dist-b-'));
    dirs.push(dirB);
    await buildPluginDist(dirB);
    const a = listFiles(dirA)
      .map((f) => f.rel)
      .sort();
    const b = listFiles(dirB)
      .map((f) => f.rel)
      .sort();
    expect(b).toEqual(a);
    for (const rel of a) {
      const bytesA = readFileSync(join(dirA, rel));
      const bytesB = readFileSync(join(dirB, rel));
      expect(bytesB.equals(bytesA)).toBe(true);
    }
  }, 20000);

  it('5: WHEN the `VERSION` file in that directory is read THEN it equals the `version` in `package.json` followed by `\\n`', () => {
    expect(readFileSync(join(dirA, 'VERSION'), 'utf8')).toBe(`${pkg.version}\n`);
  });
});
