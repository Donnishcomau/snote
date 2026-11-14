// #486: packaging/omarchy/setup copies plugin-dist with cp -R and sets modes with find -exec chmod. An OS error from either
// can quote a file name from the clone, and a name can hold an escape sequence, so setup holds that error text back and
// prints it cut to printable ASCII after its own fixed line. Linux only (the sandbox rig). Each case: 1.0.0 installed,
// then the clone ships 2.0.0 with one unreadable file whose name holds ESC [ 3 1 m and a BEL.
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type Sandbox, SPAWN_TIMEOUT_MS, cleanup, env, makeSandbox, runSetup, setBuild } from '../helpers/omarchy-sandbox';

let boxes: Sandbox[] = [];
afterEach(() => {
  for (const b of boxes) {
    try {
      chmodSync(join(b.clone, 'plugin-dist', HOSTILE), 0o644);
    } catch {
      // the case did not make it
    }
    cleanup(b);
  }
  boxes = [];
});

const HOSTILE = 'bad\x1b[31mred\x07.js';
const root = process.getuid?.() === 0;

describe.skipIf(process.platform !== 'linux' || root)('#486 setup prints OS errors without control characters', () => {
  it('1: WHEN cp -R fails on a plugin-dist file whose name holds `ESC [31m` and a BEL THEN setup exits non-zero, says `snote setup: could not copy plugin-dist into place; nothing was installed:`, its output holds no byte below 0x20 but newline and no 0x7f, and 1.0.0 stays installed', () => {
    const s = makeSandbox('1.0.0');
    boxes.push(s);
    expect(runSetup(s).status).toBe(0);
    setBuild(s, '2.0.0');
    const bad = join(s.clone, 'plugin-dist', HOSTILE);
    writeFileSync(bad, 'x\n');
    chmodSync(bad, 0o000);
    const r = runSetup(s);
    expect(r.status).not.toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    expect(r.stderr).toContain('snote setup: could not copy plugin-dist into place; nothing was installed:');
    expect(r.stderr).toContain('[31mred');
    expect([...out].filter((c) => (c < ' ' && c !== '\n') || c === '\x7f')).toEqual([]);
    expect(readFileSync(join(s.pluginDir, 'app', 'VERSION'), 'utf8').trim()).toBe('1.0.0');
  }, 20000);

  it('2: WHEN a cp that does not escape names (a stand-in first on PATH, as some systems ship) fails on plugin-dist and prints the raw name with `ESC [31m` and a BEL THEN setup prints the same fixed line and its output holds no byte below 0x20 but newline, and 1.0.0 stays installed', () => {
    const s = makeSandbox('1.0.0');
    boxes.push(s);
    expect(runSetup(s).status).toBe(0);
    setBuild(s, '2.0.0');
    const bin = join(s.root, 'fake-bin');
    mkdirSync(bin);
    const realCp = spawnSync('bash', ['-c', 'command -v cp'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(
      join(bin, 'cp'),
      `#!/bin/bash\ncase "$*" in *plugin-dist/.*) printf "cp: cannot open 'plugin-dist/${HOSTILE}': Permission denied\\n" >&2; exit 1;; esac\nexec ${realCp} "$@"\n`,
      { mode: 0o755 }
    );
    const e = env(s);
    const r = spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], { encoding: 'utf8', env: { ...e, PATH: `${bin}:${e.PATH}` }, timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' });
    expect(r.status).not.toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    expect(r.stderr).toContain('snote setup: could not copy plugin-dist into place; nothing was installed: cp: cannot open');
    expect(r.stderr).toContain('[31mred.js');
    expect([...out].filter((c) => (c < ' ' && c !== '\n') || c === '\x7f')).toEqual([]);
    expect(readFileSync(join(s.pluginDir, 'app', 'VERSION'), 'utf8').trim()).toBe('1.0.0');
  }, 20000);

  // A stand-in chmod first on PATH (find -exec looks chmod up on PATH) fails only on the stage's mode change for MODE and
  // prints a raw name with ESC [31m and a BEL; every other chmod call goes to the real one.
  function failingChmod(s: Sandbox, mode: string) {
    const bin = join(s.root, 'fake-bin');
    mkdirSync(bin);
    const realChmod = spawnSync('bash', ['-c', 'command -v chmod'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(
      join(bin, 'chmod'),
      `#!/bin/bash\ncase "$1 $*" in "${mode} "*/app.??????*) printf "chmod: changing permissions of 'app/${HOSTILE}': Operation not permitted\\n" >&2; exit 1;; esac\nexec ${realChmod} "$@"\n`,
      { mode: 0o755 }
    );
    const e = env(s);
    return spawnSync('bash', [join(s.clone, 'packaging', 'omarchy', 'setup')], { encoding: 'utf8', env: { ...e, PATH: `${bin}:${e.PATH}` }, timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' });
  }

  it.each([
    ['3', '644', 'could not set the file modes; nothing was installed: chmod: changing permissions'],
    ['4', '700', 'could not set the folder modes; nothing was installed: chmod: changing permissions'],
  ])('%s: WHEN a stand-in chmod first on PATH fails on the stage mode change %s and prints the raw name with `ESC [31m` and a BEL THEN setup prints `snote setup: %s`, its output holds no byte below 0x20 but newline and no 0x7f, and 1.0.0 stays installed', (_n, mode, line) => {
    const s = makeSandbox('1.0.0');
    boxes.push(s);
    expect(runSetup(s).status).toBe(0);
    setBuild(s, '2.0.0');
    const r = failingChmod(s, mode);
    expect(r.status).not.toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    expect(r.stderr).toContain(`snote setup: ${line}`);
    expect(r.stderr).toContain('[31mred.js');
    expect([...out].filter((c) => (c < ' ' && c !== '\n') || c === '\x7f')).toEqual([]);
    expect(readFileSync(join(s.pluginDir, 'app', 'VERSION'), 'utf8').trim()).toBe('1.0.0');
  }, 20000);
});
