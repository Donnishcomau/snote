import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { leakedDirs } from '../helpers/tmp-leak';

// Linux only: the nested runs set TMPDIR and use SIGKILL.
const root = path.resolve('.');
const probe = path.resolve('test/fixtures/tmp-leak/probe.ts');
const vitestBin = path.resolve('node_modules/.bin/vitest');
const NESTED_TIMEOUT = 60_000;

const cleanups: string[] = [];
afterAll(() => {
  for (const d of cleanups) fs.rmSync(d, { recursive: true, force: true });
});

function scratch(name: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), name));
  cleanups.push(d);
  return d;
}

// A config next to nothing in the fresh TMPDIR: the repo config with only the probe collected.
function configFile(): string {
  const dir = scratch('tmp-leak-cfg-');
  const file = path.join(dir, 'vitest.probe.config.ts');
  fs.writeFileSync(
    file,
    `import base from ${JSON.stringify(path.join(root, 'vitest.config.ts'))};\n` +
      `export default { ...base, root: ${JSON.stringify(root)}, test: { ...base.test, include: [${JSON.stringify(probe)}] } };\n`,
  );
  return file;
}

function nested(env: Record<string, string>, tmp: string, extra: string[] = []) {
  const res = spawnSync(vitestBin, ['run', '--config', configFile(), ...extra], {
    cwd: root,
    encoding: 'utf8',
    timeout: 50_000,
    env: { ...process.env, ...env, TMPDIR: tmp },
  });
  return { status: res.status, out: (res.stdout ?? '') + (res.stderr ?? '') };
}

const starting = (dir: string, prefix: string) => fs.readdirSync(dir).filter((n) => n.startsWith(prefix));

describe('a test run removes its temp home and fails when it leaves one', () => {
  it('1: WHEN a nested vitest run (TMPDIR a fresh dir) runs the fixture with one passing test THEN it exits `0` and the fresh dir holds `0` entries starting `snote-test-home-`', () => {
    const tmp = scratch('tmp-leak-run-');
    const r = nested({ PROBE_MODE: 'pass' }, tmp);
    expect(r.status).toBe(0);
    expect(starting(tmp, 'snote-test-home-')).toHaveLength(0);
  }, NESTED_TIMEOUT);

  it('2: WHEN the fixture has one failing test (an assertion that fails) THEN the nested run exits non-zero and the fresh dir holds `0` entries starting `snote-test-home-` (cleanup also runs when a test fails)', () => {
    const tmp = scratch('tmp-leak-run-');
    const r = nested({ PROBE_MODE: 'fail' }, tmp);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('expected 1 to be 2');
    expect(starting(tmp, 'snote-test-home-')).toHaveLength(0);
  }, NESTED_TIMEOUT);

  it('3: WHEN the fixture creates the directory named by `SNOTE_STATUS_DIR` and writes a file in it THEN after the nested run the fresh dir holds `0` entries starting `snote-test-status-`', () => {
    const tmp = scratch('tmp-leak-run-');
    const r = nested({ PROBE_MODE: 'status' }, tmp);
    expect(r.status).toBe(0);
    expect(starting(tmp, 'snote-test-status-')).toHaveLength(0);
  }, NESTED_TIMEOUT);

  it('4: WHEN the fixture kills its own worker with SIGKILL (so no afterAll can run) THEN the nested run exits non-zero, its output names the leftover `snote-test-home-` dir, and the fresh dir holds `0` entries starting `snote-test-home-` afterwards (the teardown removed it)', () => {
    const tmp = scratch('tmp-leak-run-');
    // The crash alone would fail the run; ignoring unhandled errors leaves the guard's own exit code as the only failure.
    const r = nested({ PROBE_MODE: 'kill' }, tmp, ['--dangerouslyIgnoreUnhandledErrors']);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/error during close[\s\S]*left behind by this run[^\n]*snote-test-home-/);
    expect(starting(tmp, 'snote-test-home-')).toHaveLength(0);
  }, NESTED_TIMEOUT);

  it('5: WHEN the test creates a dir `snote-test-home-other` in the fresh dir itself before and during a nested run of the passing fixture (the fixture waits until a signal file appears, the test creates the dir and then the signal), as another vitest process would THEN the nested run exits `0` and `snote-test-home-other` still exists afterwards (a dir this run did not create is neither a failure nor removed)', async () => {
    const tmp = scratch('tmp-leak-run-');
    const signalDir = scratch('tmp-leak-sig-');
    const signal = path.join(signalDir, 'go');
    fs.mkdirSync(path.join(tmp, 'snote-test-home-before'));
    const child = await new Promise<{ status: number | null }>((resolve) => {
      
      const p = spawn(vitestBin, ['run', '--config', configFile()], {
        cwd: root,
        stdio: 'ignore',
        env: { ...process.env, PROBE_MODE: 'wait', PROBE_SIGNAL: signal, TMPDIR: tmp },
      });
      // Wait until the nested worker made its own home, then add a foreign dir and release the fixture.
      const t = setInterval(() => {
        if (starting(tmp, 'snote-test-home-').some((n) => n !== 'snote-test-home-before')) {
          clearInterval(t);
          fs.mkdirSync(path.join(tmp, 'snote-test-home-other'));
          fs.writeFileSync(signal, '1');
        }
      }, 25);
      p.on('exit', (code) => {
        clearInterval(t);
        resolve({ status: code });
      });
    });
    expect(child.status).toBe(0);
    expect(fs.existsSync(path.join(tmp, 'snote-test-home-other'))).toBe(true);
  }, NESTED_TIMEOUT);

  it('6: WHEN the pure leak function in test/helpers/tmp-leak.ts gets the before listing `["a","snote-test-home-1"]`, the after listing `["a","snote-test-home-1","snote-test-home-2","snote-tomb-3","other"]`, the run\'s created set `["snote-test-home-2"]` and the prefix list `["snote-test-home-","snote-test-status-"]` THEN it returns exactly `["snote-test-home-2"]` (the prefixes are data, so half B adds prefixes without new code)', () => {
    expect(
      leakedDirs(
        ['a', 'snote-test-home-1'],
        ['a', 'snote-test-home-1', 'snote-test-home-2', 'snote-tomb-3', 'other'],
        ['snote-test-home-2'],
        ['snote-test-home-', 'snote-test-status-'],
      ),
    ).toEqual(['snote-test-home-2']);
  });
});
