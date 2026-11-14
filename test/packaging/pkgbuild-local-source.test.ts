/**
 * #876: packaging/aur/PKGBUILD downloads nothing. Its prepare() takes the files of the commit checked out in the git clone the
 * PKGBUILD sits in, so `makepkg -Cfsi` (docs/INSTALL.md) builds what the user cloned and no unchecked archive. Runs the PKGBUILD's
 * prepare() in bash with makepkg's startdir and srcdir set, on throwaway git repos. Needs bash, git and tar; no network.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const PKGBUILD = join(process.cwd(), 'packaging', 'aur', 'PKGBUILD');
const PKGVER = (/^pkgver=(\S+)$/m.exec(readFileSync(PKGBUILD, 'utf8')) as RegExpExecArray)[1] as string;
const work = mkdtempSync(join(tmpdir(), 'pkgbuild-src-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
  const e: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', ...extra }; // C locale: git's messages are the English ones test 2 reads (#876 review)
  for (const k of Object.keys(e)) if (k.startsWith('GIT_') && !(k in extra)) delete e[k];
  return e;
};
const git = (cwd: string, ...a: string[]) =>
  spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, env: env(), encoding: 'utf8' });
// source the PKGBUILD, set makepkg's two folders, run prepare(), then print what the arrays hold
const prepare = (pkgbuild: string, startdir: string, srcdir: string, extra: Record<string, string> = {}) =>
  spawnSync('bash', ['-c', 'source "$1" && startdir=$2 && srcdir=$3 && prepare && echo "pkgver=$pkgver sources=${#source[@]} sums=${#sha256sums[@]}"', 'prepare', pkgbuild, startdir, srcdir], {
    cwd: startdir, env: env(extra), encoding: 'utf8', timeout: 10000,
  });

/** A clone holding the PKGBUILD, a package.json of `version` and `marker.txt`, committed; then `marker.txt` is edited and `untracked.txt` added, neither committed. */
function makeClone(version = PKGVER): { repo: string; aur: string; src: string } {
  const repo = mkdtempSync(join(work, 'clone-'));
  const aur = join(repo, 'packaging', 'aur');
  mkdirSync(aur, { recursive: true });
  copyFileSync(PKGBUILD, join(aur, 'PKGBUILD'));
  writeFileSync(join(repo, 'marker.txt'), 'committed\n');
  writeFileSync(join(repo, 'package.json'), `{"name":"snote","version":"${version}"}\n`);
  expect(git(repo, 'init', '-q').status).toBe(0);
  expect(git(repo, 'add', 'marker.txt', 'package.json', 'packaging/aur/PKGBUILD').status).toBe(0);
  expect(git(repo, 'commit', '-qm', 'base').status).toBe(0);
  writeFileSync(join(repo, 'marker.txt'), 'edited, not committed\n');
  writeFileSync(join(repo, 'untracked.txt'), 'not committed\n');
  const src = join(aur, 'src');
  mkdirSync(src);
  return { repo, aur, src };
}

describe('#876: the PKGBUILD builds the checked-out commit and downloads nothing', () => {
  it('1: WHEN prepare() runs in packaging/aur of a git clone THEN it exits `0`, `src/snote-<pkgver>/marker.txt` holds the committed `committed`, the uncommitted `untracked.txt` is not there, and the PKGBUILD has 0 sources and 0 checksums', () => {
    const c = makeClone();
    const r = prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src);
    expect(r.status, r.stderr).toBe(0);
    const ver = /pkgver=(\S+) sources=0 sums=0/.exec(r.stdout);
    expect(ver).not.toBeNull();
    const top = join(c.src, `snote-${(ver as RegExpExecArray)[1]}`);
    expect(readFileSync(join(top, 'marker.txt'), 'utf8')).toBe('committed\n');
    expect(existsSync(join(top, 'packaging', 'aur', 'PKGBUILD'))).toBe(true);
    expect(existsSync(join(top, 'untracked.txt'))).toBe(false);
  });

  it('2: WHEN the PKGBUILD sits in a folder that is in no git clone THEN prepare() exits non-zero and `src` stays empty', () => {
    const lone = mkdtempSync(join(work, 'lone-'));
    copyFileSync(PKGBUILD, join(lone, 'PKGBUILD'));
    const src = join(lone, 'src');
    mkdirSync(src);
    const r = prepare(join(lone, 'PKGBUILD'), lone, src, { GIT_CEILING_DIRECTORIES: work });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not a git repository/);
    expect(r.stdout).not.toContain('sources=');
    expect(readdirSync(src)).toEqual([]);
  });

  it('4: WHEN the checked-out commit\'s package.json says version `9.9.9` and the PKGBUILD\'s pkgver is another THEN prepare() exits non-zero and says `pkgver is <pkgver>, but the checked-out commit is snote 9.9.9`', () => {
    const c = makeClone('9.9.9');
    const r = prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`pkgver is ${PKGVER}, but the checked-out commit is snote 9.9.9`);
    expect(r.stdout).not.toContain('sources=');
  });

  it('3: WHEN docs/INSTALL.md is read THEN it says `makepkg` builds the commit you have checked out in this clone and downloads no other copy of snote, and no longer says the same PKGBUILD will go to the AUR', () => {
    const install = readFileSync(join(process.cwd(), 'docs', 'INSTALL.md'), 'utf8').replace(/\s+/g, ' ');
    expect(install).toContain('`makepkg` builds the commit you have checked out in this clone and downloads no other copy of snote');
    expect(install).not.toContain('The same PKGBUILD will go to the AUR');
  });

  it('5: WHEN prepare() has run once and the next commit deletes `marker.txt` and adds `new.txt` THEN a second prepare() into the same src exits non-zero, says `src/snote-<pkgver> is left from an earlier build`, and adds no `new.txt`; and once src is empty again (makepkg -C) prepare() exits `0` with `new.txt` there and no `marker.txt` (#876 review)', () => {
    const c = makeClone();
    expect(prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src).status).toBe(0);
    const top = join(c.src, `snote-${PKGVER}`);
    writeFileSync(join(c.repo, 'new.txt'), 'new\n');
    expect(git(c.repo, 'rm', '-qf', 'marker.txt').status).toBe(0);
    expect(git(c.repo, 'add', 'new.txt').status).toBe(0);
    expect(git(c.repo, 'commit', '-qm', 'delete marker').status).toBe(0);
    const again = prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src);
    expect(again.status).not.toBe(0);
    expect(again.stderr).toContain(`src/snote-${PKGVER} is left from an earlier build`);
    expect(again.stdout).not.toContain('sources=');
    expect(existsSync(join(top, 'new.txt'))).toBe(false);
    rmSync(c.src, { recursive: true, force: true });
    mkdirSync(c.src);
    const clean = prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src);
    expect(clean.status, clean.stderr).toBe(0);
    expect([existsSync(join(top, 'new.txt')), existsSync(join(top, 'marker.txt'))]).toEqual([true, false]);
  });

  it('6: WHEN docs/INSTALL.md is read THEN its one makepkg line is `cd snote/packaging/aur && makepkg -Cfsi`, it says `-C` starts each build from an empty folder and `-f` builds again when a package of the same version is already there, and it no longer says a second build stops (#876 review)', () => {
    const lines = readFileSync(join(process.cwd(), 'docs', 'INSTALL.md'), 'utf8').split('\n');
    const install = lines.join(' ').replace(/\s+/g, ' ');
    expect([
      lines.filter((l) => /\bmakepkg -/.test(l)),
      install.includes('`-C` starts each build from an empty folder'),
      install.includes('`-f` builds the package again even when one of the same version is already built. Without it, makepkg prints a warning and reinstalls that earlier package without building.'),
      install.includes('a second build stops'),
    ]).toEqual([['cd snote/packaging/aur && makepkg -Cfsi'], true, true, false]);
  });

  it('7: WHEN prepare() refuses a tree left by an earlier build THEN the command its message names is the makepkg command of the docs/INSTALL.md build line (#876 review)', () => {
    const line = readFileSync(join(process.cwd(), 'docs', 'INSTALL.md'), 'utf8').split('\n').find((l) => l.startsWith('cd snote/packaging/aur && makepkg '));
    const cmd = (line ?? '').replace('cd snote/packaging/aur && ', '');
    const c = makeClone();
    expect(prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src).status).toBe(0);
    const again = prepare(join(c.aur, 'PKGBUILD'), c.aur, c.src);
    expect([again.status === 0, cmd, again.stderr]).toEqual([false, 'makepkg -Cfsi', `PKGBUILD: src/snote-${PKGVER} is left from an earlier build; run ${cmd} to build from an empty folder\n`]);
  });
});
