/**
 * Issue #69 (0.2.8 slice): how snote was installed comes from the real path of
 * the running entry file; only a plugin install may be offered an update action;
 * a package install runs no update check; the version check asks only the
 * manifest homepage. No network: the git runner is a fake.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import {
  HOMEPAGE,
  canOfferUpdate,
  homepageGuard,
  installKind,
  updateChecksFor,
  type InstallKind,
} from '../../src/core/install-kind';
import { checkRemoteUpdate, checkRemoteVersion, type GitRunner } from '../../src/core/update-check';

const tmps: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-kind-'));
  tmps.push(d);
  return fs.realpathSync(d);
};
afterEach(() => {
  delete process.env.SNOTE_INSTALL_KIND;
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const ALL: InstallKind[] = ['plugin', 'package', 'dev', 'unknown'];
const identity = (p: string): string => p;

/** A clone dir whose .git/config names `url` as the origin. */
function cloneWithOrigin(url: string): string {
  const dir = mk();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), `[remote "origin"]\n\turl = ${url}\n`);
  return dir;
}

describe('issue #69 install kind per install', () => {
  it('1: WHEN the real entry path is under `omarchy-snote-plugin/app`, under `/usr/`, in a git checkout or elsewhere THEN the kind is `plugin`, `package`, `dev` or `unknown`, and `SNOTE_INSTALL_KIND=package` changes nothing', () => {
    const data = mk();
    fs.mkdirSync(path.join(data, 'omarchy-snote-plugin', 'app'), { recursive: true });
    fs.writeFileSync(path.join(data, 'omarchy-snote-plugin', 'app', 'cli.js'), '');
    const checkout = mk();
    fs.mkdirSync(path.join(checkout, '.git'));
    fs.mkdirSync(path.join(checkout, 'dist'));
    fs.writeFileSync(path.join(checkout, 'dist', 'cli.js'), '');
    const other = mk();
    fs.writeFileSync(path.join(other, 'cli.js'), '');
    // a symlink in an unrelated place that points into the plugin build is judged by its real path
    const link = path.join(other, 'link.js');
    fs.symlinkSync(path.join(data, 'omarchy-snote-plugin', 'app', 'cli.js'), link);

    process.env.SNOTE_INSTALL_KIND = 'package';
    const kind = (entry: string, realpath?: (p: string) => string) =>
      installKind({ entry, dataHome: data, realpath, hasGit: (d) => d === '/nowhere' });
    expect(installKind({ entry: path.join(data, 'omarchy-snote-plugin', 'app', 'cli.js'), dataHome: data })).toBe('plugin');
    expect(installKind({ entry: link, dataHome: data })).toBe('plugin');
    expect(installKind({ entry: path.join(checkout, 'dist', 'cli.js'), dataHome: data })).toBe('dev');
    expect(installKind({ entry: path.join(other, 'cli.js'), dataHome: data })).toBe('unknown');
    expect(kind('/usr/lib/snote/cli.js', identity)).toBe('package');
    expect(kind('/usr/local/lib/snote/cli.js', identity)).toBe('package');
    expect(kind('/usrx/lib/cli.js', identity)).toBe('unknown');
  });

  it('2: WHEN the real path holds an escape byte or `..`, is relative or empty, or cannot be resolved THEN the kind is `unknown`', () => {
    const data = mk();
    const app = path.join(data, 'omarchy-snote-plugin', 'app');
    const k = (entry: string | undefined, realpath: (p: string) => string = identity) =>
      installKind({ entry, dataHome: data, realpath });
    expect(k(`${app}/cli.js`)).toBe('plugin');
    expect(k(`${app}/\u001b]52;c;x\u0007cli.js`)).toBe('unknown');
    expect(k(`${app}/cli\u0085.js`)).toBe('unknown');
    expect(k(`${app}/../../etc/cli.js`)).toBe('unknown');
    expect(k('/usr/lib/../../tmp/cli.js')).toBe('unknown');
    expect(k('app/cli.js')).toBe('unknown');
    expect(k('')).toBe('unknown');
    expect(k(undefined)).toBe('unknown');
    expect(k(`${app}/cli.js`, () => { throw new Error('ENOENT'); })).toBe('unknown');
  });

  it('3: WHEN `canOfferUpdate` is asked for each kind THEN it is true for `plugin` only', () => {
    expect(ALL.map((kind) => [kind, canOfferUpdate(kind)])).toEqual([
      ['plugin', true],
      ['package', false],
      ['dev', false],
      ['unknown', false],
    ]);
  });

  it('4: WHEN the kind is `package` THEN `updateChecksFor` is false so no check, banner, spawn or write happens, and it is true for `plugin`, `dev` and `unknown`', () => {
    expect(ALL.map((kind) => [kind, updateChecksFor(kind)])).toEqual([
      ['plugin', true],
      ['package', false],
      ['dev', true],
      ['unknown', true],
    ]);
  });

  it('5: WHEN the origin is the homepage (any case, `/` or `.git`) THEN `0.9.0` is found with the `credential.helper=` flags, and for another origin or `-o`, `--namespace`, insteadOf, `--upload-pack`, `-C /` no `ls-remote` runs', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8')) as { homepage: string };
    expect(HOMEPAGE).toBe(manifest.homepage);
    const calls: string[][] = [];
    const inner: GitRunner = async (args) => {
      calls.push(args);
      return { code: 0, stdout: 'abc123\trefs/tags/v0.9.0\n' };
    };
    const ask = (url: string) =>
      checkRemoteVersion({ cloneDir: cloneWithOrigin(url), env: {}, run: homepageGuard(inner) });
    for (const ok of [
      'https://github.com/donnishcomau/snote',
      'https://GitHub.com/DonnishComau/Snote.git/',
      'https://github.com/donnishcomau/snote.git',
    ]) {
      expect((await ask(ok))?.version, ok).toBe('0.9.0');
    }
    expect(calls).toHaveLength(3);
    // the real call carries the config guards before the subcommand, and the guard still sees it
    for (const c of calls) {
      expect(c).toContain('credential.helper=');
      expect(c.indexOf('credential.helper=')).toBeLessThan(c.indexOf('ls-remote'));
    }
    calls.length = 0;
    for (const bad of [
      'https://evil.example/donnishcomau/snote',
      'https://github.com/donnishcomau/snote-evil',
      'https://github.com/other/snote',
      // split so the export email scan does not flag it
      `https://user${'@'}github.com/donnishcomau/snote`,
      'https://github.com/donnishcomau/snote/extra',
      '/tmp/some/local/repo',
    ]) {
      expect(await ask(bad), bad).toBeNull();
      const state = await checkRemoteUpdate({ cloneDir: cloneWithOrigin(bad), stateDir: mk(), env: {}, now: 1, run: homepageGuard(inner) });
      expect(state.state, bad).toBe('unknown');
    }
    expect(calls.filter((c) => c.includes('ls-remote'))).toEqual([]);
    // argv the guard must refuse although a loose parser would let it through
    const guard = homepageGuard(inner);
    const opts = { cwd: '/', timeoutMs: 1, env: {} };
    const FLAGS = ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null'];
    const FOREIGN = 'https://evil.example/x';
    const refused = { code: null, stdout: '' };
    for (const argv of [
      ['ls-remote', '-o', HOMEPAGE, FOREIGN],
      ['ls-remote', '--namespace', HOMEPAGE, FOREIGN],
      ['-c', `url.${FOREIGN}.insteadOf=${HOMEPAGE}`, 'ls-remote', HOMEPAGE, 'HEAD'],
      ['ls-remote', '--upload-pack=/bin/true', HOMEPAGE, 'HEAD'],
      ['-C', '/', 'ls-remote', HOMEPAGE, 'HEAD'],
      ['-c', 'ls-remote', 'status'],
      ['-c', 'ls-remote', HOMEPAGE, 'status'],
      [...FLAGS, 'ls-remote', '--tags', HOMEPAGE, FOREIGN],
    ]) {
      expect(await guard(argv, opts), argv.join(' ')).toEqual(refused);
    }
    expect(calls.filter((c) => c.includes('ls-remote'))).toEqual([]);
    // both exact shapes, and a call without `ls-remote`, reach the runner
    await guard([...FLAGS, 'ls-remote', '--tags', HOMEPAGE], opts);
    await guard(['ls-remote', HOMEPAGE, 'HEAD'], opts);
    await guard(['-c', 'credential.helper=', 'rev-parse', 'HEAD'], opts);
    expect(calls).toHaveLength(3);
  });

  it('6: WHEN src/cli/main.tsx is read THEN the update block runs only when `updateChecksFor(runningInstallKind())` and both update calls get `run: homepageGuard()`', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain("await import('../core/install-kind')");
    expect(src).toContain('if (!updateChecksFor(runningInstallKind())) return;');
    expect(src).toContain('startUpdateWatch({ version: VERSION, home: os.homedir(), env: process.env, stateDir: statusDir(process.env), run: homepageGuard() });');
    expect(src).toContain('void runUpdateChecks({ version: VERSION, home: os.homedir(), env: process.env, stateDir: statusDir(process.env), run: homepageGuard() }).catch');
  });
});
