/**
 * Issue #299 ( returns): two snotes that start together on a stale
 * instance lock must not both end up holding it. The children are real node
 * processes running the real src/core/instance-lock.ts through tsx; a round
 * is one data dir per child pair, and both children call acquireInstanceLock
 * on it at the same millisecond (an absolute start time the parent sends once
 * both children report ready, never a sleep). Linux only (setsid, /proc).
 */
import { afterAll, describe, it, expect } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireInstanceLock } from '../../src/core/instance-lock';

const ROOT = process.cwd();
const LOCK_TS = join(ROOT, 'src', 'core', 'instance-lock.ts');
const T_MS = 60000;
const HELD = 'it holds the instance lock';
const tmps: string[] = [];
afterAll(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-lock-race-'));
  tmps.push(d);
  return d;
}

// Child A: for each round, wait for its absolute start time, then try the lock on <base>/d<r>.
const RACE_CHILD = `
import { acquireInstanceLock } from ${JSON.stringify(LOCK_TS)};
const [base, rounds] = [process.argv[2], Number(process.argv[3])];
console.log('ready');
const t0 = Number(await new Promise((res) => process.stdin.once('data', (b) => res(String(b).trim()))));
const out = [];
for (let r = 0; r < rounds; r++) {
  while (Date.now() < t0 + r * 4) { /* spin to the shared instant */ }
  try { acquireInstanceLock(base + '/d' + r); out.push('1'); }
  catch (e) { out.push(String(e.message).includes(${JSON.stringify(HELD)}) ? 'L' : 'E:' + e.message); }
}
console.log(JSON.stringify({ pid: process.pid, out }));
process.stdin.on('end', () => process.exit(0));
`;

// Child B: SIGKILL itself at its k-th file change under <dir>, then (if it was never killed) report how many it made.
const CRASH_CHILD = `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const [dir, k] = [process.argv[2], Number(process.argv[3])];
let n = 0;
for (const name of ['openSync', 'unlinkSync', 'renameSync', 'writeSync', 'linkSync', 'symlinkSync', 'mkdirSync', 'rmdirSync']) {
  const orig = fs[name];
  fs[name] = (...a) => { if (String(a[0]).startsWith(dir) && ++n === k) process.kill(process.pid, 'SIGKILL'); return orig(...a); };
}
syncBuiltinESMExports();
const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)});
acquireInstanceLock(dir);
console.log(JSON.stringify({ changes: n }));
process.exit(0);
`;


// Child C (test 9): the other start has just finished its sweep (it removed the stale lock) when this one takes the marker;
// if this one then goes on to remove the lock, the other start's fresh lock lands first and is the one removed.
const HOOK_CHILD = `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const dir = process.argv[2];
const lock = dir + '/instance.lock';
const sweep = lock + '.sweep';
const go = dir + '.go';
const { openSync, unlinkSync } = fs;
let first = true;
let second = true;
fs.openSync = (p, ...a) => { if (p === sweep && first) { first = false; unlinkSync(lock); fs.writeFileSync(go, ''); } return openSync(p, ...a); };
fs.unlinkSync = (p, ...a) => {
  if (p === lock && second) {
    second = false;
    const t = Date.now();
    while (Date.now() - t < 5000) { try { if (/^\\d+$/.test(fs.readFileSync(lock, 'utf8'))) break; } catch { /* not there yet */ } }
  }
  return unlinkSync(p, ...a);
};
syncBuiltinESMExports();
const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)});
try { acquireInstanceLock(dir); console.log('WON ' + process.pid); } catch (e) { console.log('REFUSED ' + e.message); }
process.exit(0);
`;

const PLAIN_CHILD = `
const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)});
try { acquireInstanceLock(process.argv[2]); console.log('WON ' + process.pid); } catch (e) { console.log('REFUSED ' + e.message); }
process.exit(0);
`;

function script(name: string, text: string): string {
  const p = join(tmp(), name);
  writeFileSync(p, text);
  return p;
}

function start(args: string[]): ChildProcess {
  return spawn(process.execPath, ['--import', 'tsx', ...args], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
}

function lines(child: ChildProcess): { next: () => Promise<string>; done: Promise<void> } {
  let buf = '';
  const waiting: ((l: string) => void)[] = [];
  const queue: string[] = [];
  child.stdout?.on('data', (b: Buffer) => {
    buf += String(b);
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const w = waiting.shift();
      if (w) w(l); else queue.push(l);
    }
  });
  const done = new Promise<void>((res) => child.once('close', () => res()));
  return { next: () => (queue.length ? Promise.resolve(queue.shift() as string) : new Promise((res) => waiting.push(res))), done };
}

/** Two children race `rounds` dirs, each pre-made by `prepare`; returns per round the two outcomes and the dir. */
async function race(rounds: number, prepare: (dir: string) => void): Promise<{ dir: string; a: string; b: string; pidA: number; pidB: number }[]> {
  const base = tmp();
  for (let r = 0; r < rounds; r++) {
    mkdirSync(join(base, `d${r}`));
    prepare(join(base, `d${r}`));
  }
  const file = script('race-child.mjs', RACE_CHILD);
  const kids = [start([file, base, String(rounds)]), start([file, base, String(rounds)])];
  const io = kids.map(lines);
  await Promise.all(io.map((x) => x.next()));
  const t0 = Date.now() + 400;
  for (const k of kids) k.stdin?.write(`${t0}\n`);
  const reports = await Promise.all(io.map((x) => x.next()));
  for (const k of kids) k.stdin?.end();
  await Promise.all(io.map((x) => x.done));
  const [A, B] = reports.map((l) => JSON.parse(l) as { pid: number; out: string[] });
  return A.out.map((a, r) => ({ dir: join(base, `d${r}`), a, b: B.out[r], pidA: A.pid, pidB: B.pid }));
}

function expectOneWinner(rows: { dir: string; a: string; b: string; pidA: number; pidB: number }[]): void {
  const bad: string[] = [];
  rows.forEach((x, r) => {
    const winners = [x.a === '1' ? x.pidA : 0, x.b === '1' ? x.pidB : 0].filter(Boolean);
    const losers = [x.a, x.b].filter((o) => o !== '1');
    const content = readFileSync(join(x.dir, 'instance.lock'), 'utf8').trim();
    if (winners.length !== 1 || losers.length !== 1 || losers[0] !== 'L' || content !== String(winners[0]) || readdirSync(x.dir).join() !== 'instance.lock') {
      bad.push(`round ${r}: a=${x.a} b=${x.b} lock=${content} files=${readdirSync(x.dir).join('+')}`);
    }
  });
  expect(bad).toEqual([]);
}

/** For k = 1, 2, ... a child takes over a stale lock and is SIGKILLed at its k-th file change; `after` sees each killed dir, every file in it set 10 s back. Stops at the first k the child finishes. */
async function killPoints(after: (dir: string, k: number) => void): Promise<void> {
  const file = script('crash-child.mjs', CRASH_CHILD);
  for (let k = 1; k <= 30; k++) {
    const dir = join(tmp(), 'data');
    mkdirSync(dir);
    writeFileSync(join(dir, 'instance.lock'), '999999999');
    const child = start([file, dir, String(k)]);
    const code = await new Promise<{ code: number | null; signal: string | null }>((res) => child.once('close', (c, s) => res({ code: c, signal: s })));
    if (code.signal !== 'SIGKILL') {
      expect(code.code).toBe(0);
      return;
    }
    const past = new Date(Date.now() - 10000);
    for (const f of readdirSync(dir)) utimesSync(join(dir, f), past, past);
    after(dir, k);
  }
}

function takeWithin2(dir: string): boolean {
  for (let call = 0; call < 2; call++) {
    try {
      acquireInstanceLock(dir);
      return true;
    } catch { /* a leftover may refuse one call */ }
  }
  return false;
}

function spawnLivePid(): number {
  const out = spawnSync('sh', ['-c', 'setsid sleep 60 < /dev/null > /dev/null 2>&1 & echo $!'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout.trim();
  const pid = Number(out);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('could not spawn a live pid');
  return pid;
}

describe('two snotes starting together on a stale instance lock (#299)', () => {
  it('1: WHEN `instance.lock` holds the dead pid `999999999` and two real child processes call acquireInstanceLock on that dir at the same instant, for 400 rounds, THEN in every round exactly one child returns a lock and the other throws a message containing `it holds the instance lock`, the lock file holds the pid of the child that returned, and the dir holds no other file', async () => {
    const rows = await race(400, (d) => writeFileSync(join(d, 'instance.lock'), '999999999'));
    expect(rows).toHaveLength(400);
    expectOneWinner(rows);
  }, T_MS);

  it('2: WHEN `instance.lock` is an empty file last modified 10 seconds ago (its owner died before it wrote its pid) and two real child processes call acquireInstanceLock on that dir at the same instant, for 400 rounds, THEN in every round exactly one child returns a lock, the other throws a message containing `it holds the instance lock`, the lock file holds the winner\'s pid, and the dir holds no other file', async () => {
    const rows = await race(400, (d) => { writeFileSync(join(d, 'instance.lock'), ''); utimesSync(join(d, 'instance.lock'), new Date(Date.now() - 10000), new Date(Date.now() - 10000)); });
    expect(rows).toHaveLength(400);
    expectOneWinner(rows);
  }, T_MS);

  it('3: WHEN a child that takes over a stale lock is SIGKILLed at its k-th file change in the dir (k = 1, 2, 3 and on until a child finishes unkilled; at least 3 kill points are seen) THEN, after every file left in the dir has its modification time set 10 seconds back, acquireInstanceLock on that dir succeeds within 2 calls and the lock file holds this process\'s pid', async () => {
    let killed = 0;
    await killPoints((dir, k) => {
      killed++;
      let lock: { release: () => void } | null = null;
      for (let call = 0; call < 2 && !lock; call++) {
        try { lock = acquireInstanceLock(dir); } catch { /* a leftover may refuse one call */ }
      }
      expect(lock, `kill point ${k}: left ${readdirSync(dir).join('+')}`).not.toBeNull();
      expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(String(process.pid));
      lock?.release();
    });
    expect(killed).toBeGreaterThanOrEqual(3);
  }, T_MS);

  it('4: WHEN `instance.lock` holds the pid of a live process that never acquired it and two real child processes call acquireInstanceLock on that dir at the same instant, for 50 rounds, THEN every call throws a message containing `it holds the instance lock`, the lock file still holds that pid, and the dir holds no other file', async () => {
    const live = spawnLivePid();
    try {
      const rows = await race(50, (d) => writeFileSync(join(d, 'instance.lock'), String(live)));
      const bad = rows.filter((x) => x.a !== 'L' || x.b !== 'L' || readFileSync(join(x.dir, 'instance.lock'), 'utf8').trim() !== String(live) || readdirSync(x.dir).join() !== 'instance.lock');
      expect(rows).toHaveLength(50);
      expect(bad).toEqual([]);
    } finally {
      try { process.kill(live, 'SIGKILL'); } catch { /* already gone */ }
    }
  }, T_MS);

  it('5: WHEN `instance.lock` is an empty file written just now (its owner is mid-start, between creating the file and writing its pid) THEN acquireInstanceLock throws a message containing `it holds the instance lock` and the file is still empty', () => {
    const dir = join(tmp(), 'data');
    mkdirSync(dir);
    writeFileSync(join(dir, 'instance.lock'), '');
    expect(() => acquireInstanceLock(dir)).toThrow(HELD);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8')).toBe('');
    expect(readdirSync(dir)).toEqual(['instance.lock']);
  }, T_MS);

  it('6: WHEN `instance.lock` is an empty file whose modification time is 1 hour after now (the clock was set back after its owner died) THEN acquireInstanceLock succeeds within 2 calls and the lock file holds this process\'s pid', () => {
    const dir = join(tmp(), 'data');
    mkdirSync(dir);
    writeFileSync(join(dir, 'instance.lock'), '');
    const ahead = new Date(Date.now() + 3600000);
    utimesSync(join(dir, 'instance.lock'), ahead, ahead);
    expect(takeWithin2(dir)).toBe(true);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(String(process.pid));
  }, T_MS);

  it('7: WHEN `instance.lock` holds the dead pid `999999999` and `instance.lock.sweep` is an empty file whose modification time is 1 hour after now THEN acquireInstanceLock succeeds within 2 calls and the lock file holds this process\'s pid', () => {
    const dir = join(tmp(), 'data');
    mkdirSync(dir);
    writeFileSync(join(dir, 'instance.lock'), '999999999');
    writeFileSync(join(dir, 'instance.lock.sweep'), '');
    const ahead = new Date(Date.now() + 3600000);
    utimesSync(join(dir, 'instance.lock.sweep'), ahead, ahead);
    expect(takeWithin2(dir)).toBe(true);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(String(process.pid));
  }, T_MS);

  it('8: WHEN a takeover was SIGKILLed at any kill point of test 3 and a later start then acquires the lock and releases it THEN the dir holds no file', async () => {
    let killed = 0;
    await killPoints((dir, k) => {
      killed++;
      let lock: { release: () => void } | null = null;
      for (let call = 0; call < 2 && !lock; call++) {
        try { lock = acquireInstanceLock(dir); } catch { /* a leftover may refuse one call */ }
      }
      expect(lock, `kill point ${k}`).not.toBeNull();
      lock?.release();
      expect(readdirSync(dir), `kill point ${k}`).toEqual([]);
    });
    expect(killed).toBeGreaterThanOrEqual(3);
  }, T_MS);

  it('9: WHEN a start takes the takeover marker after another start has already removed the stale lock, and that other start creates its fresh lock while the first is between its re-check and its removal step (forced with the fs wrappers FILE A already uses) THEN the fresh lock is not removed: exactly one of the two starts returns a lock and the lock file holds its pid', async () => {
    const dir = join(tmp(), 'data');
    mkdirSync(dir);
    writeFileSync(join(dir, 'instance.lock'), '999999999');
    const go = `${dir}.go`;
    const hooked = start([script('hook-child.mjs', HOOK_CHILD), dir]);
    const hookedIo = lines(hooked);
    const plain = script('plain-child.mjs', PLAIN_CHILD);
    const hookedLine = hookedIo.next();
    await Promise.race([hookedLine, new Promise<void>((res) => { const poll = (): void => { if (existsSync(go)) res(); else setTimeout(poll, 5); }; poll(); })]);
    const other = start([plain, dir]);
    const otherLine = await lines(other).next();
    await hookedIo.done;
    const outs = [otherLine, await hookedLine];
    const winners = outs.filter((o) => o.startsWith('WON '));
    expect(winners, outs.join(' | ')).toHaveLength(1);
    expect(outs.filter((o) => o.startsWith('REFUSED ') && o.includes(HELD))).toHaveLength(1);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(winners[0].slice(4));
  }, T_MS);
});
