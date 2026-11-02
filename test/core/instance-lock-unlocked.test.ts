/**
 * #385: acquireInstanceLock tells the flock outcomes apart (locked, held, or no kernel lock for one of three
 * reasons), retries a timed-out flock once on the same dir fd, and buildStore says once, in the notice line,
 * when a start runs without the kernel lock. The spawn of /usr/bin/flock is replaced in-process; every other
 * spawn is the real one.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { acquireInstanceLock } from '../../src/core/instance-lock';
import { onProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { buildStore } from '../../src/cli/main';

type Call = { args: string[]; opts: Record<string, unknown> };
const flock = vi.hoisted(() => ({ answers: [] as unknown[], calls: [] as { args: string[]; opts: Record<string, unknown> }[] }));

vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>();
  return {
    ...real,
    spawnSync: (file: string, ...rest: unknown[]) => {
      if (file !== '/usr/bin/flock') {
        return (real.spawnSync as (...a: unknown[]) => unknown)(file, ...rest);
      }
      flock.calls.push({ args: rest[0] as string[], opts: rest[1] as Record<string, unknown> });
      if (flock.answers.length === 0) {
        throw new Error('test: no flock answer queued');
      }
      return flock.answers.shift();
    },
  };
});

const err = (code: string) => Object.assign(new Error(`spawnSync /usr/bin/flock ${code}`), { code });
const LOCKED = { status: 0, signal: null };
const HELD = { status: 1, signal: null };
const ENOENT = { status: null, signal: null, error: err('ENOENT') };
const ST65 = { status: 65, signal: null };
const TIMEOUT = { status: null, signal: 'SIGKILL', error: err('ETIMEDOUT') };
const SIGTERM = { status: null, signal: 'SIGTERM' };
const EAGAIN = { status: null, signal: null, error: err('EAGAIN') };

const TEXT_MISSING = 'No kernel lock (flock not installed): two copies started at once may both run.';
const TEXT_REFUSED = 'No kernel lock (folder may refuse it): two copies started at once may both run.';
const TEXT_TIMEOUT = 'No kernel lock (flock timed out): two copies started at once may both run.';

const dirs: string[] = [];
const releases: (() => void)[] = [];
const children: ChildProcess[] = [];

const fresh = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-unlocked-'));
  dirs.push(dir);
  return dir;
};

/** Queue the flock answers for one acquire and clear the call log. */
const answer = (...answers: unknown[]): Call[] => {
  flock.answers = [...answers];
  flock.calls = [];
  return flock.calls;
};

const acquire = (dir: string) => {
  const lock = acquireInstanceLock(dir);
  releases.push(lock.release);
  return lock;
};

const lockFile = (dir: string): string => path.join(dir, 'instance.lock');
const lockPid = (dir: string): string => fs.readFileSync(lockFile(dir), 'utf8').trim();

const thrown = (fn: () => unknown): Error => {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error('test: expected a throw');
};

afterEach(() => {
  for (const r of releases.splice(0)) r();
  for (const c of children.splice(0)) c.kill('SIGKILL');
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  flock.answers = [];
  flock.calls = [];
  resetProblemSignal();
});

describe('#385 instance lock without the kernel lock', () => {
  it("1: WHEN the replaced spawn of `/usr/bin/flock` answers `status` `0` on its first call THEN acquireInstanceLock returns a lock whose `unlocked` is `undefined`, the spawn was called `1` time with the arguments `-n` and `0` and the option `killSignal` `SIGKILL`, `instance.lock` holds this process's pid, and after release the folder holds no `instance.lock`", () => {
    const dir = fresh();
    const calls = answer(LOCKED);
    const lock = acquire(dir);
    expect(lock.unlocked).toBe(undefined);
    expect(calls.length).toBe(1);
    expect(calls[0].args).toEqual(['-n', '0']);
    expect(calls[0].opts.killSignal).toBe('SIGKILL');
    expect(lockPid(dir)).toBe(String(process.pid));
    lock.release();
    expect(fs.existsSync(lockFile(dir))).toBe(false);
  });

  it("2: WHEN this process already holds the lock for a folder (the first call answered `status` `0`) and a second acquireInstanceLock on the same folder gets `status` `1` THEN it throws an Error whose message contains `it holds the instance lock` and `(pid ` followed by this process's pid, the spawn was called `1` time for that second call (no retry), and `instance.lock` still holds this process's pid; and WHEN, on a fresh folder with no `instance.lock`, the spawn first answers a timeout and then `status` `1` THEN it throws an Error containing `it holds the instance lock`, the spawn was called `2` times, and that folder holds no `instance.lock` (a held lock seen on the retry still refuses)", () => {
    const dir = fresh();
    answer(LOCKED);
    acquire(dir);
    const second = answer(HELD);
    const e = thrown(() => acquire(dir));
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain('it holds the instance lock');
    expect(e.message).toContain(`(pid ${process.pid}`);
    expect(second.length).toBe(1);
    expect(lockPid(dir)).toBe(String(process.pid));

    const other = fresh();
    const calls = answer(TIMEOUT, HELD);
    const e2 = thrown(() => acquire(other));
    expect(e2).toBeInstanceOf(Error);
    expect(e2.message).toContain('it holds the instance lock');
    expect(calls.length).toBe(2);
    expect(fs.existsSync(lockFile(other))).toBe(false);
  });

  it('3: WHEN the spawn answers an `error` with `code` `ENOENT` (the program is missing), and, in a second case on another folder, answers `status` `65` THEN the first returns a lock with `unlocked` `missing` and the second one with `unlocked` `refused`, each spawn was called `1` time (no retry), and each `instance.lock` holds this process\'s pid', () => {
    const a = fresh();
    const callsA = answer(ENOENT);
    expect(acquire(a).unlocked).toBe('missing');
    expect(callsA.length).toBe(1);
    expect(lockPid(a)).toBe(String(process.pid));

    const b = fresh();
    const callsB = answer(ST65);
    expect(acquire(b).unlocked).toBe('refused');
    expect(callsB.length).toBe(1);
    expect(lockPid(b)).toBe(String(process.pid));
  });

  it("4: WHEN the spawn first answers a timeout (`status` `null`, `signal` `SIGKILL`, `error` with `code` `ETIMEDOUT`) and on its second call `status` `0`, and, in a second case on another folder, first answers an `error` with `code` `EAGAIN` and then `status` `0` THEN each returns a lock whose `unlocked` is `undefined`, the spawn was called `2` times, the second call's `timeout` option is greater than the first's (which is `1000`) and at most `5000`, and both calls have `killSignal` `SIGKILL`", () => {
    expect(TIMEOUT).toMatchObject({ status: null, signal: 'SIGKILL', error: { code: 'ETIMEDOUT' } });
    for (const first of [TIMEOUT, EAGAIN]) {
      const dir = fresh();
      const calls = answer(first, LOCKED);
      expect(acquire(dir).unlocked).toBe(undefined);
      expect(calls.length).toBe(2);
      expect(calls[0].opts.timeout).toBe(1000);
      expect(calls[1].opts.timeout as number).toBeGreaterThan(calls[0].opts.timeout as number);
      expect(calls[1].opts.timeout as number).toBeLessThanOrEqual(5000);
      expect(calls[0].opts.killSignal).toBe('SIGKILL');
      expect(calls[1].opts.killSignal).toBe('SIGKILL');
    }
  });

  it('5: WHEN the spawn answers a timeout on both calls, and, in a second case on another folder, a death by signal (`status` `null`, `signal` `SIGTERM`) on the first call and a timeout on the second THEN each returns a lock with `unlocked` `timeout`, the spawn was called exactly `2` times (not 3), and each `instance.lock` holds this process\'s pid', () => {
    expect(SIGTERM).toEqual({ status: null, signal: 'SIGTERM' });
    for (const pair of [[TIMEOUT, TIMEOUT], [SIGTERM, TIMEOUT]]) {
      const dir = fresh();
      const calls = answer(...pair, LOCKED);
      expect(acquire(dir).unlocked).toBe('timeout');
      expect(calls.length).toBe(2);
      expect(lockPid(dir)).toBe(String(process.pid));
    }
  });

  it('6: WHEN `instance.lock` holds the pid of a live child process (a real `sleep` child started before the file is written) and the spawn answers, in three cases on three folders, `ENOENT`, `status` `65` and a timeout on both calls THEN acquireInstanceLock throws an Error containing `it holds the instance lock` and that child\'s pid in all three, `instance.lock` still holds the child\'s pid, and WHEN `instance.lock` instead holds the dead pid `999999999` and the spawn answers `ENOENT` THEN it returns a lock with `unlocked` `missing` and the file holds this process\'s pid', () => {
    const child = spawn('sleep', ['30'], { stdio: 'ignore' });
    children.push(child);
    const pid = String(child.pid);
    expect(Number(pid)).toBeGreaterThan(0);
    for (const answers of [[ENOENT], [ST65], [TIMEOUT, TIMEOUT]]) {
      const dir = fresh();
      fs.writeFileSync(lockFile(dir), pid);
      answer(...answers);
      const e = thrown(() => acquire(dir));
      expect(e).toBeInstanceOf(Error);
      expect(e.message).toContain('it holds the instance lock');
      expect(e.message).toContain(pid);
      expect(lockPid(dir)).toBe(pid);
    }

    const stale = fresh();
    fs.writeFileSync(lockFile(stale), '999999999');
    answer(ENOENT);
    expect(acquire(stale).unlocked).toBe('missing');
    expect(lockPid(stale)).toBe(String(process.pid));
  });

  it('7: WHEN buildStore (the idiom of test/core/status-quit.test.ts: the fake server, a fresh data folder) starts three times with the spawn answering `ENOENT`, `status` `65` and a timeout on both calls, with an `onProblem` listener attached THEN the listener receives exactly `1` message per start, equal to the `missing`, `refused` and `timeout` text of TEXTS, with `info` `true`, each text is at most `80` characters and holds neither the data folder path nor an ESC (`\\u001b`), and WHEN the spawn answers `status` `0` THEN no message containing `No kernel lock` is received', async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    const got: { message: string; info: boolean }[] = [];
    const off = onProblem((message, info) => got.push({ message, info }));
    const start = (...answers: unknown[]): { dir: string; seen: { message: string; info: boolean }[] } => {
      const dir = fresh();
      answer(...answers);
      const before = got.length;
      const built = buildStore({ dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 }, { email: 'test@example.com', token: 'test-token' }, vi.fn());
      releases.push(built.stopSaving);
      return { dir, seen: got.slice(before) };
    };
    try {
      const cases: [unknown[], string][] = [
        [[ENOENT], TEXT_MISSING],
        [[ST65], TEXT_REFUSED],
        [[TIMEOUT, TIMEOUT], TEXT_TIMEOUT],
      ];
      for (const [answers, text] of cases) {
        const { dir, seen } = start(...answers);
        expect(seen.length).toBe(1);
        expect(seen[0]).toEqual({ message: text, info: true });
        expect(seen[0].message.length).toBeLessThanOrEqual(80);
        expect(seen[0].message).not.toContain(dir);
        expect(seen[0].message).not.toContain('\u001b');
      }
      const { seen } = start(LOCKED);
      expect(seen.filter((s) => s.message.includes('No kernel lock'))).toEqual([]);
    } finally {
      off();
      for (const r of releases.splice(0)) r();
      await new Promise((r) => setTimeout(r, 100));
      server.stop();
    }
  });
});
