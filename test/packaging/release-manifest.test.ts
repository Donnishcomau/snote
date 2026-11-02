/**
 * Issue #68: the release manifest writer, the allowed_signers rules and the plugin-dist copy.
 * scripts/release-manifest.sh writes SHA256SUMS for a release tree; scripts/check-allowed-signers.mjs checks the pinned-keys file;
 * build-plugin-dist copies that file into plugin-dist and refuses an invalid one. No network, no ssh-keygen.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';

const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'release-manifest-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const put = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const manifest = (tree: string, sha: string) =>
  spawnSync('bash', [join(root, 'scripts', 'release-manifest.sh'), tree, '9.9.9', sha], { encoding: 'utf8', timeout: 10000 });
const check = (file: string, ...args: string[]) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'check-allowed-signers.mjs'), file, ...args], { encoding: 'utf8', timeout: 10000 });

const SK = 'sk-ssh-ed25519' + '@openssh.com';
const B64_A = 'AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B64_B = 'AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAIBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const line = (type: string, key: string, comment = 'snote-release-main', principal = 'snote-release', ns = 'namespaces="snote-release"') =>
  `${principal} ${ns} ${type} ${key}${comment ? ' ' + comment : ''}`;
const GOOD = [line(SK, B64_A), line(SK, B64_B, 'snote-release-backup')];

describe('issue #68: release tooling', () => {
  it('1: WHEN release-manifest.sh runs on a tree holding a stale `SHA256SUMS`, a stale `SHA256SUMS.sig`, a `.git` folder and 6 other files THEN the new `SHA256SUMS` starts with the line `snote 9.9.9` and the commit, then one `<sha256>  <path>` line per other file sorted by path, none for `SHA256SUMS`, `SHA256SUMS.sig` or `.git`, and `SHA256SUMS.sig` is gone', () => {
    const tree = join(work, 'tree1');
    const files: Record<string, string> = {
      'B.txt': 'upper\n',
      'a.txt': 'lower\n',
      'a/b.txt': 'nested\n',
      'BarWidget.qml': 'qml\n',
      'packaging/release/allowed_signers': '# keys\n',
      'plugin-dist/cli.js': 'cli\n',
    };
    for (const [rel, text] of Object.entries(files)) put(join(tree, rel), text);
    put(join(tree, '.git', 'config'), 'git\n');
    put(join(tree, 'SHA256SUMS'), 'stale\n');
    put(join(tree, 'SHA256SUMS.sig'), 'stale\n');
    const sha = '0123456789abcdef0123456789abcdef01234567';
    expect(manifest(tree, sha).status).toBe(0);
    const lines = readFileSync(join(tree, 'SHA256SUMS'), 'utf8').split('\n');
    expect(lines.pop()).toBe('');
    expect(lines.length).toBe(7);
    expect(lines[0]).toBe(`snote 9.9.9 ${sha}`);
    const expected = Object.keys(files)
      .sort()
      .map((rel) => `${sha256(files[rel] as string)}  ${rel}`);
    expect(lines.slice(1)).toEqual(expected);
    expect(lines.join('\n')).not.toContain('.git');
    expect(lines.join('\n')).not.toContain('SHA256SUMS');
    expect(existsSync(join(tree, 'SHA256SUMS.sig'))).toBe(false);
  });

  it('2: WHEN release-manifest.sh runs on a tree that holds a symlink, or a file whose name has a backslash, or a file whose name has a control character THEN it exits `1`, names the path and writes no `SHA256SUMS`', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const cases: Record<string, (tree: string) => string> = {
      symlink: (tree) => { symlinkSync('/etc/hostname', join(tree, 'link')); return 'link'; },
      backslash: (tree) => { put(join(tree, 'we\\ird.txt'), 'x\n'); return 'we\\ird.txt'; },
      control: (tree) => { put(join(tree, 'tab\there.txt'), 'x\n'); return 'tab'; },
    };
    for (const [name, make] of Object.entries(cases)) {
      const tree = join(work, `tree2-${name}`);
      put(join(tree, 'ok.txt'), 'ok\n');
      const path = make(tree);
      const ran = manifest(tree, sha);
      expect({ name, status: ran.status }).toEqual({ name, status: 1 });
      expect(ran.stderr).toContain(path);
      expect(existsSync(join(tree, 'SHA256SUMS'))).toBe(false);
    }
  });

  it('3: WHEN check-allowed-signers.mjs reads a file THEN it exits `0` for 2 hardware-key lines with comments and blank lines, and exits `1` for a `*` principal, a missing or wide `namespaces` option, an extra option, a plain `ssh-ed25519` key, a duplicate key, trailing text, a file over 4096 bytes, and (with `--min 2`) a file with 1 key saying `at least 2`', () => {
    const f = (name: string, lines: string[]) => {
      const file = join(work, name);
      writeFileSync(file, lines.join('\n') + '\n');
      return file;
    };
    const good = check(f('good', ['# header', '', ...GOOD, '# end']), '--min', '2');
    expect(good.status).toBe(0);
    expect(good.stdout).toContain('2 key(s) ok');
    const bad: Record<string, string[]> = {
      wildcardPrincipal: [line(SK, B64_A, 'c', '*')],
      noNamespaces: [`snote-release ${SK} ${B64_A} c`],
      wideNamespaces: [line(SK, B64_A, 'c', 'snote-release', 'namespaces="*"')],
      extraOption: [line(SK, B64_A, 'c', 'snote-release', 'cert-authority namespaces="snote-release"')],
      commaPrincipal: [line(SK, B64_A, 'c', 'snote-release,other')],
      plainType: [line('ssh-ed25519', B64_A)],
      duplicate: [line(SK, B64_A), line(SK, B64_A, 'again')],
      trailingText: [line(SK, B64_A) + ' two words'],
      tooBig: ['# ' + 'x'.repeat(4100), ...GOOD],
    };
    for (const [name, lines] of Object.entries(bad)) {
      const ran = check(f(`bad-${name}`, lines));
      expect({ name, status: ran.status }).toEqual({ name, status: 1 });
    }
    const one = check(f('one', [GOOD[0] as string]), '--min', '2');
    expect(one.status).toBe(1);
    expect(one.stderr).toContain('at least 2');
  }, 20000);

  it('4: WHEN buildPluginDist builds into a temp directory THEN `allowed_signers` in it equals `packaging/release/allowed_signers` byte for byte and `SHA256SUMS` there lists it, and a file with 2 hardware-key lines is shipped unchanged too', async () => {
    const out = mkdtempSync(join(work, 'dist-'));
    await buildPluginDist(out);
    const shipped = readFileSync(join(root, 'packaging', 'release', 'allowed_signers'));
    expect(shipped.length).toBeGreaterThan(0);
    expect(existsSync(join(out, 'allowed_signers'))).toBe(true);
    expect(readFileSync(join(out, 'allowed_signers')).equals(shipped)).toBe(true);
    expect(readFileSync(join(out, 'SHA256SUMS'), 'utf8').split('\n')).toContain(`${sha256(shipped)}  allowed_signers`);
    const keyed = join(work, 'keyed-signers');
    writeFileSync(keyed, '# keys\n' + GOOD.join('\n') + '\n');
    const out2 = mkdtempSync(join(work, 'dist-'));
    await buildPluginDist(out2, { allowedSignersPath: keyed });
    expect(readFileSync(join(out2, 'allowed_signers'), 'utf8')).toBe('# keys\n' + GOOD.join('\n') + '\n');
  }, 20000);

  it('5: WHEN buildPluginDist is given an `allowed_signers` with a `*` principal or a plain `ssh-ed25519` key THEN it throws a message holding `allowed_signers` and builds nothing', async () => {
    for (const [name, bad] of [['wildcard', line(SK, B64_A, 'c', '*')], ['plain', line('ssh-ed25519', B64_A)]] as const) {
      const file = join(work, `bad-build-${name}`);
      writeFileSync(file, bad + '\n');
      const out = mkdtempSync(join(work, 'dist-'));
      await expect(buildPluginDist(out, { allowedSignersPath: file })).rejects.toThrow('allowed_signers');
      expect(existsSync(join(out, 'cli.js'))).toBe(false);
    }
  }, 20000);

  it('6: WHEN `sha256sum` fails for a file (it exits `1` while printing a hash, exits `1` printing nothing, or exits `0` printing no hash) THEN release-manifest.sh exits `1`, names the file, writes no `SHA256SUMS` and does not say `sign it next`, and `--check` on a tree whose `SHA256SUMS` holds the line `  ok` exits `1`', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const stubs: Record<string, string> = {
      failsWithHash: `echo ${'0'.repeat(64)}  -\nexit 1`,
      failsSilently: 'exit 1',
      noHash: 'echo NOTAHASH  -\nexit 0',
    };
    for (const [name, body] of Object.entries(stubs)) {
      const bin = join(work, `bin6-${name}`);
      put(join(bin, 'sha256sum'), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, 'sha256sum'), 0o755);
      const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
      const tree = join(work, `tree6-${name}`);
      put(join(tree, 'ok'), 'ok\n');
      const ran = spawnSync('bash', [join(root, 'scripts', 'release-manifest.sh'), tree, '9.9.9', sha], { encoding: 'utf8', timeout: 10000, env });
      expect({ name, status: ran.status }).toEqual({ name, status: 1 });
      expect(ran.stderr).toContain('ok');
      expect(ran.stdout).not.toContain('sign it next');
      expect(existsSync(join(tree, 'SHA256SUMS'))).toBe(false);
      put(join(tree, 'SHA256SUMS'), `snote 9.9.9 ${sha}\n  ok\n`);
      const checked = spawnSync('bash', [join(root, 'scripts', 'release-manifest.sh'), '--check', tree, '9.9.9', sha], { encoding: 'utf8', timeout: 10000, env });
      expect({ name, status: checked.status }).toEqual({ name, status: 1 });
    }
  }, 20000);

  it('7: WHEN release-manifest.sh refuses a tree (it holds a symlink) that already has `SHA256SUMS` and `SHA256SUMS.sig` THEN it exits `1`, `SHA256SUMS.sig` is gone and `SHA256SUMS` is unchanged', () => {
    const tree = join(work, 'tree7');
    put(join(tree, 'ok.txt'), 'ok\n');
    symlinkSync('/etc/hostname', join(tree, 'link'));
    put(join(tree, 'SHA256SUMS'), 'old manifest\n');
    put(join(tree, 'SHA256SUMS.sig'), 'old signature\n');
    const ran = manifest(tree, '0123456789abcdef0123456789abcdef01234567');
    expect(ran.status).toBe(1);
    expect(existsSync(join(tree, 'SHA256SUMS.sig'))).toBe(false);
    expect(readFileSync(join(tree, 'SHA256SUMS'), 'utf8')).toBe('old manifest\n');
  }, 20000);

  it('8: WHEN a file name holds the C1 control `U+0085`, the bidi override `U+202E` or the bidi isolate `U+2066` THEN release-manifest.sh exits `1`, names the path and writes no `SHA256SUMS`, while a file named `é.txt` is listed, and WHEN `grep -P` fails (it exits `2`) THEN release-manifest.sh exits `1`, says `grep -P` and writes no `SHA256SUMS`', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    const names: Record<string, string> = { c1: 'a\u0085b.txt', override: 'a\u202eb.txt', isolate: 'a\u2066b.txt' };
    for (const [name, file] of Object.entries(names)) {
      const tree = join(work, `tree8-${name}`);
      put(join(tree, 'ok.txt'), 'ok\n');
      put(join(tree, file), 'x\n');
      const ran = manifest(tree, sha);
      expect({ name, status: ran.status }).toEqual({ name, status: 1 });
      expect(ran.stderr).toContain('b.txt');
      expect(existsSync(join(tree, 'SHA256SUMS'))).toBe(false);
    }
    const fine = join(work, 'tree8-fine');
    put(join(fine, 'é.txt'), 'x\n');
    expect(manifest(fine, sha).status).toBe(0);
    expect(readFileSync(join(fine, 'SHA256SUMS'), 'utf8')).toContain('  é.txt\n');
    // a grep that cannot run the pattern (BSD grep has no -P) must not read as "no match"
    const bin = join(work, 'bin8-grep');
    put(join(bin, 'grep'), '#!/bin/sh\nexit 2\n');
    chmodSync(join(bin, 'grep'), 0o755);
    const nogrep = join(work, 'tree8-nogrep');
    put(join(nogrep, 'ok.txt'), 'ok\n');
    const failed = spawnSync('bash', [join(root, 'scripts', 'release-manifest.sh'), nogrep, '9.9.9', sha], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('grep -P');
    expect(existsSync(join(nogrep, 'SHA256SUMS'))).toBe(false);
  }, 20000);

  it('9: WHEN check-allowed-signers.mjs gets `--min x`, `--min 2.5` or `--min` with no value THEN it exits `1` and says `whole number`, and with `--min 2` a file of 2 keys exits `0`', () => {
    const file = join(work, 'two-keys');
    writeFileSync(file, GOOD.join('\n') + '\n');
    for (const args of [['--min', 'x'], ['--min', '2.5'], ['--min']]) {
      const ran = check(file, ...args);
      expect({ args, status: ran.status }).toEqual({ args, status: 1 });
      expect(ran.stderr).toContain('whole number');
    }
    expect(check(file, '--min', '2').status).toBe(0);
    const one = join(work, 'one-key');
    writeFileSync(one, GOOD[0] + '\n');
    expect(check(one, '--min', '2').status).toBe(1);
  }, 20000);
});
