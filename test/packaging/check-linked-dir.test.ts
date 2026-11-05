// #483: `build-plugin-dist --check` used to copy the fresh SHA256SUMS into a folder that is a symlink, so it
// wrote through the link. It now refuses a linked folder first, as a build does. A plain folder is checked as before.
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareFreshBuild } from '../../scripts/build-plugin-dist.mjs';

const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'check-linked-dir-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let n = 0;
/** A target folder holding only a stale SHA256SUMS and a symlink `plugin-dist` to it. */
function linked(): { target: string; link: string; sums: string } {
  const dir = join(work, `case${++n}`);
  const target = join(dir, 'target');
  mkdirSync(target, { recursive: true });
  const sums = join(target, 'SHA256SUMS');
  writeFileSync(sums, 'stale\n');
  const link = join(dir, 'plugin-dist');
  symlinkSync(target, link);
  return { target, link, sums };
}

describe('#483 build-plugin-dist --check refuses a linked folder', () => {
  it('1: WHEN compareFreshBuild gets a symlink to a folder whose SHA256SUMS is stale THEN it rejects with `symlink` and the target SHA256SUMS still holds `stale\\n`', async () => {
    const { link, sums } = linked();
    await expect(compareFreshBuild(link)).rejects.toThrow(/symlink/);
    expect(readFileSync(sums, 'utf8')).toBe('stale\n');
  }, 30000);

  it('2: WHEN `node scripts/build-plugin-dist.mjs --check` gets that symlink, plain and with a trailing `/`, THEN it exits non-zero and the target SHA256SUMS still holds `stale\\n`', () => {
    const { link, sums } = linked();
    for (const arg of [link, `${link}/`]) {
      const r = spawnSync(process.execPath, ['scripts/build-plugin-dist.mjs', '--check', arg], { cwd: root, encoding: 'utf8' });
      expect(r.status, arg).not.toBe(0);
      expect(r.stderr, arg).toMatch(/symlink/);
      expect(readFileSync(sums, 'utf8'), arg).toBe('stale\n');
    }
  }, 30000);

  it('3: WHEN compareFreshBuild gets a plain folder with a stale SHA256SUMS THEN it is checked (a non-empty path comes back) and the SHA256SUMS is rewritten', async () => {
    const dir = join(work, `case${++n}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SHA256SUMS'), 'stale\n');
    const diff = await compareFreshBuild(dir);
    expect(typeof diff).toBe('string');
    expect(diff).not.toBe('');
    expect(existsSync(join(dir, 'SHA256SUMS'))).toBe(true);
    expect(readFileSync(join(dir, 'SHA256SUMS'), 'utf8')).not.toBe('stale\n');
  }, 30000);
});
