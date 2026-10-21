/**
 * F234 + F235 (updater pre-build UP-01, UP-02): the release-tag check runs at
 * most once per 24 h across restarts and while open, and every ls-remote call
 * on the update path carries the credential and config guards. The git runner
 * is a fake and the clock and the timer are injected: no network, no waiting.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';

import { checkRemoteUpdate } from '../../src/core/update-check';
import type { GitRunner } from '../../src/core/update-check';
import { currentBanner, resetBanner } from '../../src/core/update-banner';
import { pluginCloneDir } from '../../src/core/update-state';
import { startUpdateWatch, WATCH_INTERVAL_MS } from '../../src/core/update-watch';

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const COMMIT = 'b'.repeat(40);
const CACHE = 'update-tag-check.json';

const roots: string[] = [];
const stops: Array<() => void> = [];

function makeRoot(): { home: string; stateDir: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f234-'));
  roots.push(home);
  fs.mkdirSync(path.join(pluginCloneDir(home), '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginCloneDir(home), '.git', 'config'),
    '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
  );
  return { home, stateDir: path.join(home, 'state') };
}

const tagLines = (...names: string[]): string =>
  names.map((n) => `${COMMIT}\trefs/tags/${n}`).join('\n') + '\n';

function makeRunner(answer: () => { code: number | null; stdout: string }): {
  run: GitRunner;
  calls: string[][];
  envs: NodeJS.ProcessEnv[];
} {
  const calls: string[][] = [];
  const envs: NodeJS.ProcessEnv[] = [];
  const run: GitRunner = async (args, o) => {
    calls.push(args);
    envs.push(o.env);
    return answer();
  };
  return { run, calls, envs };
}

const noTimer = (): ((fn: () => void, ms: number) => () => void) => () => () => {};
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  resetBanner();
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('F234 + F235 tag-check cadence and git guards', () => {
  it('1: WHEN snote starts twice within 24 h THEN the runner is called `1` time, the cache file is `{ checkedAt, version, commit }` with mode `600`, and the second start still shows the banner', async () => {
    const { home, stateDir } = makeRoot();
    const { run, calls } = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.5', 'v0.2.8') }));
    stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: noTimer(), stateDir, now: () => T0 }));
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.8' }));
    const file = path.join(stateDir, CACHE);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ checkedAt: T0, version: '0.2.8', commit: COMMIT });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    stops.pop()?.();
    resetBanner();
    stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: noTimer(), stateDir, now: () => T0 + 3_600_000 }));
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.8' }));
    expect(calls).toHaveLength(1);
  });

  it('2: WHEN snote starts again `24` h after the last successful check THEN the runner is called again', async () => {
    const { home, stateDir } = makeRoot();
    let stdout = tagLines('v0.2.8');
    const { run, calls } = makeRunner(() => ({ code: 0, stdout }));
    stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: noTimer(), stateDir, now: () => T0 }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await flush();
    stops.pop()?.();
    stdout = tagLines('v0.2.9');
    stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: noTimer(), stateDir, now: () => T0 + DAY }));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
      expect(JSON.parse(fs.readFileSync(path.join(stateDir, CACHE), 'utf8')).version).toBe('0.2.9');
    });
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, CACHE), 'utf8')).checkedAt).toBe(T0 + DAY);
  });

  it('3: WHEN the check fails (exit `128`, a killed git, or a thrown error) THEN no `update-tag-check.json` is written and the state folder does not exist', async () => {
    const { home, stateDir } = makeRoot();
    const failures: Array<() => { code: number | null; stdout: string }> = [
      () => ({ code: 128, stdout: '' }),
      () => ({ code: null, stdout: tagLines('v0.2.9') }),
      () => {
        throw new Error('spawn failed');
      },
    ];
    for (const answer of failures) {
      const { run, calls } = makeRunner(answer);
      stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: noTimer(), stateDir, now: () => T0 }));
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      await flush();
      expect(currentBanner()).toBeNull();
      stops.pop()?.();
    }
    expect(fs.existsSync(path.join(stateDir, CACHE))).toBe(false);
    expect(fs.existsSync(stateDir)).toBe(false);
  });

  it('4: WHEN the cache is not JSON, holds a version with an escape byte, a `checkedAt` in the future, a bad commit or is oversized THEN it counts as no cache and the banner never shows its version', async () => {
    const hostile = [
      'not json {',
      JSON.stringify({ checkedAt: T0, version: '0.2.9' + String.fromCharCode(27) + ']52;c;QQ==' + String.fromCharCode(7), commit: COMMIT }),
      JSON.stringify({ checkedAt: T0 + 3_600_000, version: '0.2.9', commit: COMMIT }),
      JSON.stringify({ checkedAt: T0, version: '0.2.9', commit: '--upload-pack=evil' }),
      JSON.stringify({ checkedAt: T0, version: '0.2.9', commit: COMMIT, pad: 'x'.repeat(10_000) }),
      JSON.stringify({ checkedAt: 'now', version: '0.2.9', commit: COMMIT }),
      'null',
    ];
    // control: the same shape, valid and fresh, is trusted (no call, banner shown), so the cases below could have shown 0.2.9
    const ok = makeRoot();
    fs.mkdirSync(ok.stateDir, { recursive: true });
    fs.writeFileSync(path.join(ok.stateDir, CACHE), JSON.stringify({ checkedAt: T0 - 3_600_000, version: '0.2.9', commit: COMMIT }));
    const okRun = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.5') }));
    stops.push(startUpdateWatch({ version: '0.2.6', home: ok.home, env: {}, run: okRun.run, schedule: noTimer(), stateDir: ok.stateDir, now: () => T0 }));
    await vi.waitFor(() => expect(currentBanner()).toEqual({ running: '0.2.6', available: '0.2.9' }));
    expect(okRun.calls).toHaveLength(0);
    stops.pop()?.();
    resetBanner();
    for (const content of hostile) {
      const { home, stateDir } = makeRoot();
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, CACHE), content);
      const { run, calls } = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.5') }));
      stops.push(startUpdateWatch({ version: '0.2.6', home, env: {}, run, schedule: noTimer(), stateDir, now: () => T0 }));
      await vi.waitFor(() => expect(calls, content.slice(0, 40)).toHaveLength(1));
      await flush();
      expect(currentBanner(), content.slice(0, 40)).toBeNull();
      stops.pop()?.();
    }
  });

  it('5: WHEN the tag check and the HEAD check call git for an https origin THEN each ls-remote argv contains `credential.helper=` and `protocol.allow=never` and no `protocol.file.allow`, the env has `GIT_TERMINAL_PROMPT` `0` and `GIT_CONFIG_NOSYSTEM` `1`, and a local-path origin adds `protocol.file.allow=always`', async () => {
    const { home, stateDir } = makeRoot();
    const tag = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.8') }));
    stops.push(
      startUpdateWatch({
        version: '0.2.6',
        home,
        env: { GIT_CONFIG_NOSYSTEM: '0', GIT_ASKPASS: 'x' } as NodeJS.ProcessEnv,
        run: tag.run,
        schedule: noTimer(),
        stateDir,
        now: () => T0,
      })
    );
    await vi.waitFor(() => expect(tag.calls).toHaveLength(1));
    const head = makeRunner(() => ({ code: 0, stdout: `${COMMIT}\tHEAD\n` }));
    await checkRemoteUpdate({ cloneDir: pluginCloneDir(home), stateDir, env: {}, now: T0, run: head.run });
    const heads = head.calls.filter((a) => a.includes('ls-remote'));
    expect(heads).toHaveLength(1);
    for (const [argv, env] of [
      [tag.calls[0], tag.envs[0]],
      [heads[0], head.envs[head.calls.indexOf(heads[0])]],
    ] as Array<[string[], NodeJS.ProcessEnv]>) {
      const at = argv.indexOf('credential.helper=');
      expect(at).toBeGreaterThan(0);
      expect(argv[at - 1]).toBe('-c');
      expect(argv.indexOf('ls-remote')).toBeGreaterThan(at);
      expect(argv).toContain('core.hooksPath=/dev/null');
      expect(argv).toContain('protocol.allow=never');
      expect(argv.some((a) => a.startsWith('protocol.file.allow'))).toBe(false);
      expect(env.GIT_TERMINAL_PROMPT).toBe('0');
      expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
      expect(env.GIT_ASKPASS).toBeUndefined();
    }
    // a local absolute-path origin (tests only) is the one case that adds protocol.file.allow=always
    const local = makeRoot();
    fs.writeFileSync(
      path.join(pluginCloneDir(local.home), '.git', 'config'),
      '[remote "origin"]\n\turl = /srv/snote.git\n'
    );
    const lr = makeRunner(() => ({ code: 0, stdout: tagLines('v0.2.8') }));
    stops.push(startUpdateWatch({ version: '0.2.6', home: local.home, env: {}, run: lr.run, schedule: noTimer(), stateDir: local.stateDir, now: () => T0 }));
    await vi.waitFor(() => expect(lr.calls).toHaveLength(1));
    expect(lr.calls[0]).toContain('protocol.file.allow=always');
    expect(lr.calls[0]).toContain('credential.helper=');
  });

  it('6: WHEN snote stays open and the 24 h timer fires after a check that took a second THEN the runner is called again and the cache `checkedAt` is the time the check started', async () => {
    const { home, stateDir } = makeRoot();
    let clock = T0;
    const { run, calls } = makeRunner(() => {
      clock += 1000;
      return { code: 0, stdout: tagLines('v0.2.8') };
    });
    let fire: () => void = () => {};
    stops.push(
      startUpdateWatch({
        version: '0.2.6',
        home,
        env: {},
        run,
        schedule: (fn, ms) => {
          expect(ms).toBe(WATCH_INTERVAL_MS);
          fire = fn;
          return () => {};
        },
        stateDir,
        now: () => clock,
      })
    );
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.waitFor(() =>
      expect(JSON.parse(fs.readFileSync(path.join(stateDir, CACHE), 'utf8')).checkedAt).toBe(T0)
    );
    clock = T0 + DAY;
    fire();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
  });
});
