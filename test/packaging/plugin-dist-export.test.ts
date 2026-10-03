/**
 * T343: the public export ships plugin-dist/ and CI proves it matches the
 * source. buildPluginDist writes SHA256SUMS next to the chunks; --check
 * rebuilds and compares byte for byte; the export script, the CI workflow
 * and the README all say so.
 *
 * Tests 1 and 2 each build the real distribution once in their own temp
 * directory (own beforeAll, so neither depends on the other's order);
 * tests 3-5 read the shipped text files. No network.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = join('scripts', 'build-plugin-dist.mjs');

/** Relative paths (forward slashes) of every file under dir, recursively. */
function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(abs, base));
    } else {
      out.push(abs.slice(base.length + 1).split(/[\\/]/).join('/'));
    }
  }
  return out;
}

/** Run the real build script (its own process) into dir. A build is esbuild
 * over the whole app, so the caller gets the longer vitest timeout. */
function buildInto(dir: string): void {
  const built = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  expect(built.status).toBe(0);
}

describe('T343 pre-built plugin files in the public export', () => {
  it("1: WHEN buildPluginDist builds into a temp directory THEN SHA256SUMS there has one line per other file, and each line's hash equals the sha256 of that file", () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-dist-export-'));
    try {
      buildInto(dir);
      const sums = readFileSync(join(dir, 'SHA256SUMS'), 'utf8');
      const lines = sums.split('\n').filter((line) => line !== '');
      const otherFiles = listFiles(dir)
        .filter((rel) => rel !== 'SHA256SUMS')
        .sort();
      expect(lines.length).toBe(otherFiles.length);
      expect(lines.length).toBeGreaterThan(0);
      const listed: string[] = [];
      for (const line of lines) {
        const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
        expect(match).not.toBeNull();
        const [, hash, rel] = match as unknown as [string, string, string];
        const actual = createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex');
        expect(hash).toBe(actual);
        listed.push(rel);
      }
      expect(listed.sort()).toEqual(otherFiles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("2: WHEN `node scripts/build-plugin-dist.mjs --check <that directory>` runs THEN it exits `0`; after one byte is appended to `<that directory>/cli.js` it exits `1` and its output contains `cli.js`", () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-dist-check-'));
    try {
      buildInto(dir); // "that directory" = the one test 1's WHEN built into
      const ok = spawnSync(process.execPath, [script, '--check', dir], { encoding: 'utf8' });
      expect(ok.status).toBe(0);
      appendFileSync(join(dir, 'cli.js'), 'x');
      const bad = spawnSync(process.execPath, [script, '--check', dir], { encoding: 'utf8' });
      expect(bad.status).toBe(1);
      expect(bad.stdout + bad.stderr).toContain('cli.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  // The public export legitimately excludes scripts/publish-export.sh.
  it.skipIf(!existsSync('scripts/publish-export.sh'))("3: WHEN `scripts/publish-export.sh` is read as text THEN it contains `build-plugin-dist.mjs` and `500000`", () => {
    const text = readFileSync('scripts/publish-export.sh', 'utf8');
    expect(text).toContain('build-plugin-dist.mjs');
    expect(text).toContain('500000');
  });

  it("4: WHEN `.github/workflows/check.yml` is read as text THEN it contains `build-plugin-dist.mjs --check plugin-dist`", () => {
    const text = readFileSync('.github/workflows/check.yml', 'utf8');
    expect(text).toContain('build-plugin-dist.mjs --check plugin-dist');
  });

  it("5: WHEN `README.md` is read as text THEN it contains `## Pre-built plugin files`, `npm run build:plugin` and `Requires Node.js 22 or newer`", () => {
    const text = readFileSync('README.md', 'utf8');
    expect(text).toContain('## Pre-built plugin files');
    expect(text).toContain('npm run build:plugin');
    expect(text).toContain('Requires Node.js 22 or newer');
  });
});
