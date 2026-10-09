/**
 * T390: `runUpdateChecks` — the start-up wiring that runs the local
 * check first and the once-a-day remote check second, publishing the
 * result through the update signal. A temp home holds the plugin
 * clone fixture; a fake runner counts every git call so nothing here
 * ever touches the network.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import { runUpdateChecks } from '../../src/core/update-run';
import { currentUpdate, resetUpdateSignal } from '../../src/core/update-signal';
import { pluginCloneDir } from '../../src/core/update-state';
import type { GitRunner } from '../../src/core/update-check';

const versionFile = (home: string): string =>
  path.join(pluginCloneDir(home), 'plugin-dist', 'VERSION');

/** Temp home with a plugin clone: VERSION file (or none) plus `.git`. */
const makeHome = (version: string | null): string => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t390-'));
  if (version !== null) {
    fs.mkdirSync(path.join(pluginCloneDir(home), 'plugin-dist'), { recursive: true });
    fs.writeFileSync(versionFile(home), `${version}\n`);
  }
  fs.mkdirSync(path.join(pluginCloneDir(home), '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginCloneDir(home), '.git', 'config'),
    '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
  );
  return home;
};

/** Fake runner: rev-parse `aaa\n`, ls-remote `bbb\tHEAD\n`, counting calls. */
const makeRunner = (): { run: GitRunner; calls: string[][] } => {
  const calls: string[][] = [];
  const run: GitRunner = async (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') {
      return { code: 0, stdout: 'aaa\n' };
    }
    return { code: 0, stdout: 'bbb\tHEAD\n' };
  };
  return { run, calls };
};

let home: string;

afterEach(() => {
  resetUpdateSignal();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('update-run', () => {
  it("1: WHEN version `0.2.2`, clone VERSION `0.2.3` and a fake runner are used THEN after it resolves `currentUpdate()` equals `{ kind: 'restart', available: '0.2.3' }` and the runner got `0` calls", async () => {
    home = makeHome('0.2.3');
    const { run, calls } = makeRunner();

    await runUpdateChecks({
      version: '0.2.2',
      home,
      env: {},
      stateDir: path.join(home, 'state'),
      now: 1000000,
      run,
    });

    expect(currentUpdate()).toEqual({ kind: 'restart', available: '0.2.3' });
    expect(calls).toHaveLength(0);
  });

  it("2: WHEN version `0.2.3`, clone VERSION `0.2.3` and a fake runner with different heads are used THEN `currentUpdate()` equals `{ kind: 'available' }` and `1` runner call had `args[0]` equal to `ls-remote`", async () => {
    home = makeHome('0.2.3');
    const { run, calls } = makeRunner();

    await runUpdateChecks({
      version: '0.2.3',
      home,
      env: {},
      stateDir: path.join(home, 'state'),
      now: 1000000,
      run,
    });

    expect(currentUpdate()).toEqual({ kind: 'available' });
    expect(calls.filter((args) => args[0] === 'ls-remote')).toHaveLength(1);
  });

  it("3: WHEN the setup of line 2 runs with env `SNOTE_UPDATE_CHECK` set to `off` THEN `currentUpdate()` is `null` and the runner was called `0` times", async () => {
    home = makeHome('0.2.3');
    const { run, calls } = makeRunner();

    await runUpdateChecks({
      version: '0.2.3',
      home,
      env: { SNOTE_UPDATE_CHECK: 'off' },
      stateDir: path.join(home, 'state'),
      now: 1000000,
      run,
    });

    expect(currentUpdate()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("4: WHEN the temp home has no clone at all THEN `runUpdateChecks` resolves, `currentUpdate()` is `null` and the runner was called `0` times", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t390-empty-'));
    const { run, calls } = makeRunner();

    await runUpdateChecks({
      version: '0.2.2',
      home,
      env: {},
      stateDir: path.join(home, 'state'),
      now: 1000000,
      run,
    });

    expect(currentUpdate()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("5: WHEN `src/cli/main.tsx` is read THEN it contains `runUpdateChecks(` exactly `1` time, and `test/setup.ts` contains `SNOTE_UPDATE_CHECK`", () => {
    const main = fs.readFileSync(path.resolve('src/cli/main.tsx'), 'utf8');
    expect(main.split('runUpdateChecks(').length - 1).toBe(1);
    const setup = fs.readFileSync(path.resolve('test/setup.ts'), 'utf8');
    expect(setup).toContain('SNOTE_UPDATE_CHECK');
  });
});
