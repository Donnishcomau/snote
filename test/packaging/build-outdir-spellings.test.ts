// #481 (V480-01 /): buildPluginDist, bundle and writeLauncher refuse an output path that is, or ends in, a symlink in
// every spelling (`<link>/`, `<link>/.`, `<link>//`, `./<link>/`), and a `..` after a link whose physical sibling is a planted symlink.
// A symlinked PARENT stays allowed. Refuse, never repair. Every case runs in its own mkdtemp folder under this test's own tmp dir.
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';
import { bundle, writeLauncher } from '../../scripts/build.mjs';

const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'build-outdir-spellings-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let n = 0;
/** A fresh case folder holding `vd` (with VERSION = `victim\n`) and `link` -> `vd`. */
function box(): { dir: string; vd: string; link: string } {
  const dir = mkdtempSync(join(work, `case${++n}-`));
  const vd = join(dir, 'vd');
  mkdirSync(vd);
  writeFileSync(join(vd, 'VERSION'), 'victim\n');
  const link = join(dir, 'link');
  symlinkSync(vd, link);
  return { dir, vd, link };
}

const untouched = (vd: string, link: string): void => {
  expect(readdirSync(vd)).toEqual(['VERSION']);
  expect(readFileSync(join(vd, 'VERSION'), 'utf8')).toBe('victim\n');
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
};

/** A fresh case folder holding `link` -> a MISSING `gone`. */
function dangling(): { dir: string; link: string; gone: string } {
  const dir = mkdtempSync(join(work, `case${++n}-`));
  const gone = join(dir, 'gone');
  const link = join(dir, 'link');
  symlinkSync(gone, link);
  return { dir, link, gone };
}

/** `link` -> deep/vd, so the PHYSICAL `<link>/..` is `deep`; `deep/x` is a planted symlink to a victim file. */
function planted(): { dir: string; link: string; victim: string; deepX: string } {
  const dir = mkdtempSync(join(work, `case${++n}-`));
  const vd = join(dir, 'deep', 'vd');
  mkdirSync(vd, { recursive: true });
  const link = join(dir, 'link');
  symlinkSync(vd, link);
  const victim = join(dir, 'victimfile');
  writeFileSync(victim, 'victim\n');
  const deepX = join(dir, 'deep', 'x');
  symlinkSync(victim, deepX);
  return { dir, link, victim, deepX };
}

describe('#481 an output path that is, or ends in, a symlink is refused in every spelling', () => {
  const dirSpellings: Array<[string, (link: string) => string]> = [
    ['1: WHEN `buildPluginDist` is called with an outDir spelled `link` THEN it rejects with a message holding `symlink or not a folder`, `vd` still holds only its `VERSION` and `link` is still a symlink', (l) => l],
    ['2: WHEN `buildPluginDist` is called with an outDir spelled `link/` THEN it rejects with a message holding `symlink or not a folder`, `vd` still holds only its `VERSION` and `link` is still a symlink', (l) => `${l}/`],
    ['3: WHEN `buildPluginDist` is called with an outDir spelled `link/.` THEN it rejects with a message holding `symlink or not a folder`, `vd` still holds only its `VERSION` and `link` is still a symlink', (l) => `${l}/.`],
    ['4: WHEN `buildPluginDist` is called with an outDir spelled `link//` THEN it rejects with a message holding `symlink or not a folder`, `vd` still holds only its `VERSION` and `link` is still a symlink', (l) => `${l}//`],
    ['5: WHEN `buildPluginDist` is called with an outDir spelled `./<path of link relative to process.cwd()>/` THEN it rejects with a message holding `symlink or not a folder`, `vd` still holds only its `VERSION` and `link` is still a symlink', (l) => `./${relative(process.cwd(), l)}/`],
  ];
  for (const [title, spell] of dirSpellings) {
    it(title, async () => {
      const { vd, link } = box();
      await expect(buildPluginDist(spell(link))).rejects.toThrow(/symlink or not a folder/);
      untouched(vd, link);
    }, 30000);
  }

  it('6: WHEN `bundle` is called with `outfile` spelled `link/`, `link/.` or `link//` where `link` is a DANGLING symlink THEN it rejects with a message holding `symlink or special file`, the missing target is still missing and `link` is still a symlink', async () => {
    for (const tail of ['/', '/.', '//']) {
      const { link, gone } = dangling();
      await expect(bundle({ contents: 'export const a = 1;', outfile: `${link}${tail}` })).rejects.toThrow(/symlink or special file/);
      expect(existsSync(gone)).toBe(false);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    }
  }, 60000);

  it('7: WHEN `writeLauncher` is called with `path` spelled `link/`, `link/.` or `link//` where `link` is a DANGLING symlink THEN it throws a message holding `symlink or special file`, the missing target is still missing and `link` is still a symlink', () => {
    for (const tail of ['/', '/.', '//']) {
      const { link, gone } = dangling();
      expect(() => writeLauncher(`${link}${tail}`, 'snote-main.js')).toThrow(/symlink or special file/);
      expect(existsSync(gone)).toBe(false);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    }
  });

  it('8: WHEN the PARENT folder of the output is a symlink to a real folder THEN `buildPluginDist(<parentlink>/out)`, `bundle` and `writeLauncher` still write into it', async () => {
    const dir = mkdtempSync(join(work, `case${++n}-`));
    const real = join(dir, 'real');
    mkdirSync(real);
    const parentLink = join(dir, 'plink');
    symlinkSync(real, parentLink);
    await buildPluginDist(`${parentLink}/out`);
    expect(existsSync(join(real, 'out', 'VERSION'))).toBe(true);
    await bundle({ contents: 'export const a = 1;', outfile: `${parentLink}/b.js` });
    expect(existsSync(join(real, 'b.js'))).toBe(true);
    writeLauncher(`${parentLink}/cli.js`, 'snote-main.js');
    expect(existsSync(join(real, 'cli.js'))).toBe(true);
  }, 60000);

  it('9: WHEN `node scripts/build-plugin-dist.mjs lnk/` runs (cwd = the case folder, `lnk` a symlink to a folder) THEN it exits non-zero and `vd` is untouched', () => {
    const { dir, vd } = box();
    const lnk = join(dir, 'lnk');
    symlinkSync(vd, lnk);
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'build-plugin-dist.mjs'), 'lnk/'], { cwd: dir, encoding: 'utf8', timeout: 80000 });
    expect(r.status).not.toBe(0);
    expect(readdirSync(vd)).toEqual(['VERSION']);
    expect(readFileSync(join(vd, 'VERSION'), 'utf8')).toBe('victim\n');
    expect(lstatSync(lnk).isSymbolicLink()).toBe(true);
  }, 90000);

  it('10: WHEN `writeLauncher` is called with `<link>/../x` (built by string concatenation) where the PHYSICAL `<link>/..` holds `x` as a planted symlink to a victim file THEN it throws a message holding `symlink or special file`, the victim still holds `victim\\n`, the lexical `x` does not exist and `deep/x` is still a symlink', () => {
    const { dir, link, victim, deepX } = planted();
    expect(() => writeLauncher(`${link}/../x`, 'snote-main.js')).toThrow(/symlink or special file/);
    expect(readFileSync(victim, 'utf8')).toBe('victim\n');
    expect(existsSync(join(dir, 'x'))).toBe(false);
    expect(lstatSync(deepX).isSymbolicLink()).toBe(true);
  });

  it('11: WHEN `buildPluginDist` is called with `<link>/../x` (built by string concatenation) where the PHYSICAL `<link>/..` holds `x` as a planted symlink to a victim file THEN it rejects with a message holding `symlink or not a folder`, the victim still holds `victim\\n`, the lexical `x` does not exist and `deep/x` is still a symlink', async () => {
    const { dir, link, victim, deepX } = planted();
    await expect(buildPluginDist(`${link}/../x`)).rejects.toThrow(/symlink or not a folder/);
    expect(readFileSync(victim, 'utf8')).toBe('victim\n');
    expect(existsSync(join(dir, 'x'))).toBe(false);
    expect(lstatSync(deepX).isSymbolicLink()).toBe(true);
  }, 30000);
});
