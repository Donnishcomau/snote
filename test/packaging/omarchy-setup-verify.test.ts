// #68 (setup, MUST 10): packaging/omarchy/setup hashes the STAGED copy of the build against the clone's SHA256SUMS before
// the swap, and installs nothing when it does not match. It does not verify the signature: the running build did that before
// it moved the clone to the verified commit. A clone with no SHA256SUMS (a development checkout, or an older release) keeps
// today's behaviour. Setup also sets modes from a fixed list, installs allowed_signers as 0644, refuses a symlinked one, and
// --rollback keeps the allowed_signers of the build it replaces. Linux only (flock). Every case runs in its own mkdtemp sandbox.
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, cleanup, env, makeSandbox, runSetup, setBuild } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;

afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

const REFUSED = 'update refused: the download could not be verified';
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Every file under `dir`, as paths relative to it, sorted. */
function files(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(dir, r)).isDirectory()) out.push(...files(dir, r));
    else out.push(r);
  }
  return out;
}

/** Write <clone>/SHA256SUMS the way scripts/release-manifest.sh does for the files the sandbox has: line 1, a non-plugin-dist file, then every plugin-dist file. */
function writeManifest(s: Sandbox): void {
  const dist = join(s.clone, 'plugin-dist');
  const lines = [
    `snote 2.0.0 ${'0123456789abcdef'.repeat(2)}01234567`,
    `${sha(join(s.clone, 'packaging', 'omarchy', 'setup'))}  packaging/omarchy/setup`,
    ...files(dist).map((f) => `${sha(join(dist, f))}  plugin-dist/${f}`),
  ];
  writeFileSync(join(s.clone, 'SHA256SUMS'), lines.join('\n') + '\n');
}

/** Install 1.0.0 (no manifest), then make the clone ship 2.0.0 with a manifest that matches it. */
function upgradeReady(): Sandbox {
  const s = makeSandbox('1.0.0');
  expect(runSetup(s).status).toBe(0);
  setBuild(s, '2.0.0');
  mkdirSync(join(s.clone, 'plugin-dist', 'chunks'), { recursive: true });
  writeFileSync(join(s.clone, 'plugin-dist', 'chunks', 'a-1.js'), 'export const a = 1;\n');
  writeManifest(s);
  return s;
}

/** The installed version, and what stands in the plugin directory besides app. */
const installed = (s: Sandbox): string => readFileSync(join(s.pluginDir, 'app', 'VERSION'), 'utf8').trim();
const strays = (s: Sandbox): string[] => readdirSync(s.pluginDir).filter((n) => n.startsWith('app.'));
const shimText = (s: Sandbox): string => readFileSync(s.shim, 'utf8');

/** Setup with a fake `cp` first on PATH that appends a line to the staged cli.js right after the copy into the stage. */
function runSetupWithTamperingCp(s: Sandbox) {
  const bin = join(s.root, 'fakebin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'cp'),
    ['#!/bin/sh', '/usr/bin/cp "$@" || exit $?', 'for last; do :; done', 'case "$last" in */app.*/) echo "// tampered" >> "${last}cli.js" ;; esac', ''].join('\n'),
    { mode: 0o755 },
  );
  return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    env: { ...env(s), PATH: `${bin}:${process.env.PATH ?? ''}` },
    timeout: Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500),
    killSignal: 'SIGKILL',
  });
}

describe('packaging/omarchy/setup: the staged copy is hashed against SHA256SUMS before the swap (#68 part 3)', () => {
  it('1: WHEN `SHA256SUMS` in the clone lists every `plugin-dist` file THEN `setup` installs `2.0.0` over `1.0.0` with `app.prev` holding `1.0.0`, and WHEN `plugin-dist/cli.js` is changed after `SHA256SUMS` was written THEN `setup` exits `1`, prints `update refused: the download could not be verified` and `app` still holds `1.0.0`, with no `app.prev`, no stage directory and the same shim', () => {
    sb = upgradeReady();
    const ok = runSetup(sb);
    expect(ok.status).toBe(0);
    expect(installed(sb)).toBe('2.0.0');
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8').trim()).toBe('1.0.0');

    cleanup(sb);
    sb = upgradeReady();
    const shimBefore = shimText(sb);
    appendFileSync(join(sb.clone, 'plugin-dist', 'cli.js'), '// swapped after the manifest was made\n');
    const refused = runSetup(sb);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(REFUSED);
    expect(installed(sb)).toBe('1.0.0');
    expect(strays(sb)).toEqual([]);
    expect(shimText(sb)).toBe(shimBefore);
  }, 20000);

  it('2: WHEN `SHA256SUMS` lists the `plugin-dist` files and the copy into the stage changes the staged `cli.js` THEN `setup` exits `1`, prints `update refused: the download could not be verified` and `app` still holds `1.0.0`', () => {
    sb = upgradeReady();
    const refused = runSetupWithTamperingCp(sb);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(REFUSED);
    expect(installed(sb)).toBe('1.0.0');
    expect(strays(sb)).toEqual([]);
  }, 20000);

  it('3: WHEN `plugin-dist` holds a file that `SHA256SUMS` does not list, or `SHA256SUMS` lists a `plugin-dist` file that is missing, or lists one twice, or holds a symlink that it does not list, THEN `setup` exits `1`, prints `update refused: the download could not be verified` and `app` still holds `1.0.0`', () => {
    const variants: Record<string, (s: Sandbox) => void> = {
      unlisted: (s) => writeFileSync(join(s.clone, 'plugin-dist', 'extra.js'), 'x\n'),
      missing: (s) => rmSync(join(s.clone, 'plugin-dist', 'chunks', 'a-1.js')),
      symlink: (s) => symlinkSync('/etc/hostname', join(s.clone, 'plugin-dist', 'chunks', 'link.js')),
      twice: (s) => appendFileSync(join(s.clone, 'SHA256SUMS'), `${sha(join(s.clone, 'plugin-dist', 'cli.js'))}  plugin-dist/cli.js\n`),
    };
    for (const [name, change] of Object.entries(variants)) {
      sb = upgradeReady();
      change(sb);
      const refused = runSetup(sb);
      expect({ name, status: refused.status }).toEqual({ name, status: 1 });
      expect(refused.stderr).toContain(REFUSED);
      expect(installed(sb)).toBe('1.0.0');
      cleanup(sb);
      sb = undefined;
    }
  }, 20000);

  it('4: WHEN `setup` is run directly and the clone has no `SHA256SUMS` THEN it installs `2.0.0` over `1.0.0` as before, with exit `0`, `app.prev` holding `1.0.0` and the line `installing without a manifest check` on stdout, and WHEN it is run with `--verified-update` and the clone has no `SHA256SUMS` THEN it exits `1`, prints `update refused: the download could not be verified` and `app` still holds `1.0.0`, and with `--verified-update` and a matching `SHA256SUMS` it installs `2.0.0`', () => {
    sb = upgradeReady();
    rmSync(join(sb.clone, 'SHA256SUMS'));
    const refused = runSetup(sb, ['--verified-update']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(REFUSED);
    expect(installed(sb)).toBe('1.0.0');
    expect(strays(sb)).toEqual([]);
    const ran = runSetup(sb);
    expect(ran.status).toBe(0);
    expect(ran.stderr).not.toContain(REFUSED);
    expect(ran.stdout).toContain('installing without a manifest check');
    expect(installed(sb)).toBe('2.0.0');
    expect(readFileSync(join(sb.pluginDir, 'app.prev', 'VERSION'), 'utf8').trim()).toBe('1.0.0');
    cleanup(sb);
    sb = upgradeReady();
    const ok = runSetup(sb, ['--verified-update']);
    expect(ok.status).toBe(0);
    expect(installed(sb)).toBe('2.0.0');
  }, 20000);

  it('5: WHEN `plugin-dist` holds `allowed_signers`, a `chunks` directory and file with mode `0777` and `setup` runs with umask 0 THEN in `app` every directory is `700`, `cli.js` is `755` and every other file including `allowed_signers` is `644`, and WHEN `plugin-dist/allowed_signers` is a symlink THEN `setup` exits `1`, says `allowed_signers` and `app` still holds `2.0.0`', () => {
    sb = upgradeReady();
    writeFileSync(join(sb.clone, 'plugin-dist', 'allowed_signers'), '# keys\n');
    chmodSync(join(sb.clone, 'plugin-dist', 'chunks'), 0o777);
    chmodSync(join(sb.clone, 'plugin-dist', 'chunks', 'a-1.js'), 0o777);
    rmSync(join(sb.clone, 'SHA256SUMS'));
    const ran = spawnSync('sh', ['-c', 'umask 0; exec bash "$0"', join(sb.clone, 'packaging', 'omarchy', 'setup')], {
      encoding: 'utf8',
      env: env(sb),
      timeout: Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500),
      killSignal: 'SIGKILL',
    });
    expect(ran.status).toBe(0);
    const app = join(sb.pluginDir, 'app');
    expect(files(app)).toContain('allowed_signers');
    const modes: Record<string, string> = {};
    const walk = (rel: string): void => {
      const st = statSync(join(app, rel));
      modes[rel || '.'] = (st.mode & 0o777).toString(8);
      if (st.isDirectory()) for (const n of readdirSync(join(app, rel))) walk(rel ? `${rel}/${n}` : n);
    };
    walk('');
    for (const [rel, mode] of Object.entries(modes)) {
      const isDir = statSync(join(app, rel)).isDirectory();
      expect({ rel, mode }).toEqual({ rel, mode: isDir ? '700' : rel === 'cli.js' ? '755' : '644' });
    }
    expect(modes['allowed_signers']).toBe('644');

    setBuild(sb, '3.0.0');
    rmSync(join(sb.clone, 'plugin-dist', 'allowed_signers'));
    symlinkSync('/etc/hostname', join(sb.clone, 'plugin-dist', 'allowed_signers'));
    const refused = runSetup(sb);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('allowed_signers');
    expect(installed(sb)).toBe('2.0.0');
    expect(existsSync(join(app, 'allowed_signers'))).toBe(true);
    expect(readFileSync(join(app, 'allowed_signers'), 'utf8')).toBe('# keys\n');
  }, 20000);

  it('6: WHEN `setup` installs `2.0.0` whose `allowed_signers` no longer holds the key `removed-key` that `1.0.0` had and `setup --rollback` is then run THEN `app` holds `1.0.0` and its `allowed_signers` equals the `2.0.0` file, with mode `644`', () => {
    sb = makeSandbox('1.0.0');
    writeFileSync(join(sb.clone, 'plugin-dist', 'allowed_signers'), '# keys\nkey-a\nremoved-key\n');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    writeFileSync(join(sb.clone, 'plugin-dist', 'allowed_signers'), '# keys\nkey-a\nkey-b\n');
    expect(runSetup(sb).status).toBe(0);
    expect(readFileSync(join(sb.pluginDir, 'app', 'allowed_signers'), 'utf8')).toBe('# keys\nkey-a\nkey-b\n');
    const back = runSetup(sb, ['--rollback']);
    expect(back.status).toBe(0);
    expect(installed(sb)).toBe('1.0.0');
    const signers = join(sb.pluginDir, 'app', 'allowed_signers');
    expect(readFileSync(signers, 'utf8')).toBe('# keys\nkey-a\nkey-b\n');
    expect(readFileSync(signers, 'utf8')).not.toContain('removed-key');
    expect((statSync(signers).mode & 0o777).toString(8)).toBe('644');
  }, 20000);
});
