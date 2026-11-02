// #199: setup moves its directories (mv_dir) and
// its files (mv_file, 207-A1) through one helper, which refuses a symlinked
// destination and uses `mv -T`, so a symlink that appears at the instant of a
// move never sends the moved entry into the link's target.
// Linux only (GNU mv -T, flock). Each case runs in its own
// mkdtemp sandbox. On a loaded runner set SNOTE_TEST_SPAWN_MS=30000 and add
// --testTimeout=90000.
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Sandbox, cleanup, env, makeSandbox, runSetup, runShim, setBuild } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;
afterEach(() => {
  cleanup(sb);
  sb = undefined;
});

const SETUP = join(process.cwd(), 'packaging', 'omarchy', 'setup');
const SPAWN_MS = Number(process.env.SNOTE_TEST_SPAWN_MS ?? 2500);
const REAL_MV = spawnSync('sh', ['-c', 'command -v mv'], { encoding: 'utf8' }).stdout.trim();

// A stand-in mv on PATH: the first time it is asked to move something onto $RACE_NAME it first
// replaces that name by a symlink to $RACE_VICTIM (the last-instant swap), then runs the real mv.
const RACING_MV = `#!/bin/bash
last="\${@: -1}"
if [ -n "\${RACE_NAME:-}" ] && [ ! -e "$RACE_DONE" ] && [ "$(basename "$last")" = "$RACE_NAME" ]; then
  : > "$RACE_DONE"; rm -rf "$last"; ln -s "$RACE_VICTIM" "$last"
fi
exec "$REAL_MV" "$@"
`;

function victim(s: Sandbox): { dir: string; file: string } {
  const dir = join(s.root, 'victim');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'important.txt');
  writeFileSync(file, 'do not touch\n');
  return { dir, file };
}

function racingSetup(s: Sandbox, name: string, vdir: string) {
  const bin = join(s.root, 'racebin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'mv'), RACING_MV);
  chmodSync(join(bin, 'mv'), 0o755);
  return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], {
    encoding: 'utf8',
    timeout: SPAWN_MS,
    killSignal: 'SIGKILL',
    env: { ...env(s), PATH: `${bin}:${process.env.PATH ?? ''}`, REAL_MV, RACE_NAME: name, RACE_VICTIM: vdir, RACE_DONE: join(s.root, 'race.done') },
  });
}

const SETUP_TEXT = readFileSync(SETUP, 'utf8');

describe('packaging/omarchy/setup: directory swaps never go through a symlinked destination (#199)', () => {
  it('1: WHEN `app.prev` becomes a symlink to a directory at the moment of the swap THEN setup exits non-zero and the target directory still holds only `important.txt`, unchanged', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    const v = victim(sb);
    const res = racingSetup(sb, 'app.prev', v.dir);
    expect(existsSync(join(sb.root, 'race.done')), res.stderr + res.stdout).toBe(true);
    expect(res.status).not.toBe(0);
    expect(readdirSync(v.dir)).toEqual(['important.txt']);
    expect(readFileSync(v.file, 'utf8')).toBe('do not touch\n');
  });

  it('2: WHEN `app` becomes a symlink to a directory at the moment the new build is moved in THEN setup exits non-zero and the target directory still holds only `important.txt`, unchanged', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    const v = victim(sb);
    const res = racingSetup(sb, 'app', v.dir);
    expect(existsSync(join(sb.root, 'race.done')), res.stderr + res.stdout).toBe(true);
    expect(res.status).not.toBe(0);
    expect(readdirSync(v.dir)).toEqual(['important.txt']);
    expect(readFileSync(v.file, 'utf8')).toBe('do not touch\n');
  });

  it('3: WHEN `app.prev` is already a symlink to a directory before setup starts THEN setup exits `1` saying `the previous build` `is a symlink` and the target directory is unchanged', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    const v = victim(sb);
    symlinkSync(v.dir, join(sb.pluginDir, 'app.prev'));
    const res = runSetup(sb);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('the previous build');
    expect(res.stderr).toContain('is a symlink');
    expect(readdirSync(v.dir)).toEqual(['important.txt']);
  });

  it('4: WHEN the paths are real directories or absent THEN install, update, rollback and the failed-start restore work: `fake snote 1.0.0`, then `fake snote 2.0.0`, then `fake snote 1.0.0` again, then `update failed: kept 1.0.0`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    expect(runShim(sb, ['--version']).stdout).toContain('fake snote 1.0.0');
    setBuild(sb, '2.0.0');
    expect(runSetup(sb).status).toBe(0);
    expect(runShim(sb, ['--version']).stdout).toContain('fake snote 2.0.0');
    expect(runSetup(sb, ['--rollback']).status).toBe(0);
    expect(runShim(sb, ['--version']).stdout).toContain('fake snote 1.0.0');
    setBuild(sb, '3.0.0', 'broken');
    const bad = runSetup(sb);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('update failed: kept 1.0.0');
    expect(runShim(sb, ['--version']).stdout).toContain('fake snote 1.0.0');
  });

  it('5: WHEN the comments in setup describe `mv` THEN they do not claim that a plain mv never follows a destination symlink and they name `mv_dir` and `mv_file`', () => {
    expect(SETUP_TEXT).not.toContain('does not dereference a');
    expect(SETUP_TEXT).not.toContain('neither follows a destination symlink');
    expect(SETUP_TEXT).not.toContain('replaces the destination entry directly');
    expect(SETUP_TEXT).toContain('Every directory move goes');
    expect(SETUP_TEXT).toContain('mv_dir');
    expect(SETUP_TEXT).toContain('mv_file');
  });

  it('6: WHEN setup is scanned THEN every `mv` line is inside `mv_dir`, and the file temporaries `$t`, `$mark_tmp`, `$signers_tmp`, `$shim_tmp` move through `mv_file`', () => {
    const mvLines = SETUP_TEXT.split('\n').filter((l) => /^\s*(if \[[^;]*; then )?mv\s/.test(l) && !l.trim().startsWith('#'));
    const inHelper = /then mv -T -- "\$1" "\$2"; else mv -- "\$1" "\$2"; fi$/;
    expect(mvLines.length).toBe(1);
    expect(mvLines.filter((l) => !inHelper.test(l))).toEqual([]);
    expect(SETUP_TEXT.split('\n').filter((l) => /^\s*mv_dir "/.test(l)).length).toBe(9);
    for (const v of ['$t', '$mark_tmp', '$signers_tmp', '$shim_tmp']) {
      expect(SETUP_TEXT.split('\n').filter((l) => l.trim().startsWith(`mv_file "${v}" `)).length, v).toBe(1);
    }
    expect(SETUP_TEXT).toContain('mv_file() { mv_dir "$1" "$2" "$3"; }');
  });

  it('7: WHEN the shim becomes a symlink to a directory at the moment the new shim is moved in THEN setup exits `0`, the target directory still holds only `important.txt` and the shim runs `fake snote 2.0.0`', () => {
    sb = makeSandbox('1.0.0');
    expect(runSetup(sb).status).toBe(0);
    setBuild(sb, '2.0.0');
    const v = victim(sb);
    const res = racingSetup(sb, 'snote', v.dir);
    expect(existsSync(join(sb.root, 'race.done')), res.stderr + res.stdout).toBe(true);
    expect(res.status, res.stderr).toBe(0);
    expect(readdirSync(v.dir)).toEqual(['important.txt']);
    expect(readFileSync(v.file, 'utf8')).toBe('do not touch\n');
    expect(lstatSync(sb.shim).isSymbolicLink()).toBe(false);
    expect(runShim(sb, ['--version']).stdout).toContain('fake snote 2.0.0');
  });
});
