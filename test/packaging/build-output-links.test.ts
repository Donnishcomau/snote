// #412 build part (with #426): scripts/build.mjs (writeLauncher, bundle) and scripts/build-plugin-dist.mjs (buildPluginDist, --check)
// used to write through a symlink planted at an output path. They now refuse before any write: lstat, never followed, nothing
// unlinked or repaired. Every case runs in its own mkdtemp folder; victims are mode 600 and hold `victim\n`.
import { afterAll, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';
import { bundle, writeLauncher } from '../../scripts/build.mjs';

const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'build-output-links-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let n = 0;
/** A fresh case folder holding a victim file (mode 600, `victim\n`). */
function box(): { dir: string; victim: string } {
  const dir = join(work, `case${++n}`);
  mkdirSync(dir, { recursive: true });
  const victim = join(dir, 'victim');
  writeFileSync(victim, 'victim\n');
  chmodSync(victim, 0o600);
  return { dir, victim };
}

const intact = (victim: string): void => {
  expect(readFileSync(victim, 'utf8')).toBe('victim\n');
  expect((statSync(victim).mode & 0o777).toString(8)).toBe('600');
};

describe('#412 the build scripts never write through a symlink or special file', () => {
  it('3: WHEN `writeLauncher` is called on a path that is a symlink to a victim THEN it throws and the victim still holds `victim\\n` with mode `600`', () => {
    const { dir, victim } = box();
    const link = join(dir, 'cli.js');
    symlinkSync(victim, link);
    expect(() => writeLauncher(link, 'snote-main.js')).toThrow(/symlink or special file/);
    intact(victim);
  });

  it('4: WHEN `buildPluginDist` builds into an existing folder whose `VERSION` is a symlink to a victim THEN it rejects with a message holding `VERSION` and the victim still holds `victim\\n` with mode `600`', async () => {
    const { dir, victim } = box();
    const out = join(dir, 'out');
    mkdirSync(out);
    symlinkSync(victim, join(out, 'VERSION'));
    await expect(buildPluginDist(out)).rejects.toThrow(/VERSION/);
    intact(victim);
  }, 30000);

  it('5: WHEN `buildPluginDist` builds into an existing folder whose `snote-main.js` is a symlink to a victim THEN it rejects with a message holding `snote-main.js` and the victim still holds `victim\\n` with mode `600`', async () => {
    const { dir, victim } = box();
    const out = join(dir, 'out');
    mkdirSync(out);
    symlinkSync(victim, join(out, 'snote-main.js'));
    await expect(buildPluginDist(out)).rejects.toThrow(/snote-main\.js/);
    intact(victim);
  }, 30000);

  it('6: WHEN `node scripts/build-plugin-dist.mjs --check <dir>` runs on a folder built by buildPluginDist whose `SHA256SUMS` was then replaced by a symlink to a victim THEN it exits non-zero and the victim still holds `victim\\n` with mode `600`', async () => {
    const { dir, victim } = box();
    const out = join(dir, 'out');
    await buildPluginDist(out);
    rmSync(join(out, 'SHA256SUMS'));
    symlinkSync(victim, join(out, 'SHA256SUMS'));
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'build-plugin-dist.mjs'), '--check', out], { encoding: 'utf8', timeout: 90000 });
    expect(r.status).not.toBe(0);
    intact(victim);
  }, 120000);

  it('7: WHEN `bundle` from scripts/build.mjs is called with contents `export const a = 1;` and an outfile that is a symlink to a victim THEN it rejects and the victim still holds `victim\\n` with mode `600`', async () => {
    const { dir, victim } = box();
    const outfile = join(dir, 'out.js');
    symlinkSync(victim, outfile);
    await expect(bundle({ contents: 'export const a = 1;', outfile })).rejects.toThrow(/symlink or special file/);
    intact(victim);
    expect(existsSync(outfile)).toBe(true);
  }, 30000);
});
