/**
 * Issue #316 (closes the #299 residuals S2 and R2,): a start holds a
 * kernel lock (flock(2) through /usr/bin/flock on the data dir fd it keeps)
 * before any takeover step, so a takeover that is stopped part way, or a
 * leftover marker judged old by one start and removed under another, can no
 * longer let two snotes hold the instance lock. The children are real node
 * processes running the real src/core/instance-lock.ts through tsx; the S2 and
 * R2 interleavings are forced with fs wrappers that SIGSTOP a child at a named
 * step, and the parent waits for the stop in /proc (never a sleep). Linux only.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireInstanceLock } from '../../src/core/instance-lock';

const ROOT = process.cwd();
const LOCK_TS = join(ROOT, 'src', 'core', 'instance-lock.ts');
const T_MS = 60000;
const HELD = 'it holds the instance lock';
const DEAD = '999999999';
const tmps: string[] = [];
const kids: ChildProcess[] = [];
afterAll(() => {
  for (const k of kids) {
    try {
      k.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-lock-flock-'));
  tmps.push(d);
  return d;
}

// One start: optional SIGSTOP of itself just before the first unlinkSync of <dir>/<stopAt>,
// optional /usr/bin/flock made unrunnable, up to `calls` acquire calls; it reports one line and
// stays alive (holding what it won) until its stdin closes.
const START_CHILD = `
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const [dir, stopAt, calls, noFlock] = [process.argv[2], process.argv[3], Number(process.argv[4]), process.argv[5] === '1'];
const { unlinkSync } = fs;
let armed = stopAt !== '-';
fs.unlinkSync = (p, ...a) => { if (armed && p === dir + '/' + stopAt) { armed = false; process.kill(process.pid, 'SIGSTOP'); } return unlinkSync(p, ...a); };
let flockRuns = 0;
if (noFlock) {
  const { spawnSync } = cp;
  cp.spawnSync = (file, ...a) => {
    if (file === '/usr/bin/flock') { flockRuns++; const error = Object.assign(new Error('spawnSync /usr/bin/flock ENOENT'), { code: 'ENOENT' }); return { pid: 0, output: [], stdout: null, stderr: null, status: null, signal: null, error }; }
    return spawnSync(file, ...a);
  };
}
syncBuiltinESMExports();
const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)});
let line = '';
for (let i = 0; i < calls && !line.startsWith('WON'); i++) {
  try { acquireInstanceLock(dir); line = 'WON ' + process.pid; }
  catch (e) { line = String(e.message).includes(${JSON.stringify(HELD)}) ? 'REFUSED' : 'ERROR ' + e.message; }
}
console.log(line + (noFlock ? ' flockRuns=' + flockRuns : ''));
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
`;

// Hook child (test 9, the fallback): /usr/bin/flock is unrunnable; just as it takes the takeover marker it removes the
// stale lock itself (another start's sweep having finished) and SIGSTOPs, so a second start can create its fresh lock
// before this one re-checks. It reports one line and stays alive until its stdin closes.
const HOOK_CHILD = `
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const dir = process.argv[2];
const lock = dir + '/instance.lock';
const sweep = lock + '.sweep';
const { openSync, unlinkSync } = fs;
const { spawnSync } = cp;
let first = true;
let flockRuns = 0;
fs.openSync = (p, ...a) => { if (p === sweep && first) { first = false; unlinkSync(lock); process.kill(process.pid, 'SIGSTOP'); } return openSync(p, ...a); };
cp.spawnSync = (file, ...a) => {
  if (file === '/usr/bin/flock') { flockRuns++; return { pid: 0, output: [], stdout: null, stderr: null, status: null, signal: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) }; }
  return spawnSync(file, ...a);
};
syncBuiltinESMExports();
const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)});
let line;
try { acquireInstanceLock(dir); line = 'WON ' + process.pid; } catch (e) { line = String(e.message).includes(${JSON.stringify(HELD)}) ? 'REFUSED' : 'ERROR ' + e.message; }
console.log(line + ' flockRuns=' + flockRuns);
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
`;

// Race child: for each round, wait for its absolute start time, then try the lock on <base>/d<r>.
const RACE_CHILD = `
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const [base, rounds, noFlock] = [process.argv[2], Number(process.argv[3]), process.argv[4] === '1'];
if (noFlock) {
  const { spawnSync } = cp;
  cp.spawnSync = (file, ...a) => (file === '/usr/bin/flock' ? { pid: 0, output: [], stdout: null, stderr: null, status: null, signal: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) } : spawnSync(file, ...a));
  syncBuiltinESMExports();
}
const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)});
console.log('ready');
const t0 = Number(await new Promise((res) => process.stdin.once('data', (b) => res(String(b).trim()))));
const out = [];
for (let r = 0; r < rounds; r++) {
  while (Date.now() < t0 + r * 6) { /* spin to the shared instant */ }
  try { acquireInstanceLock(base + '/d' + r); out.push('1'); }
  catch (e) { out.push(String(e.message).includes(${JSON.stringify(HELD)}) ? 'L' : 'E:' + e.message); }
}
console.log(JSON.stringify({ pid: process.pid, out }));
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
`;

function script(name: string, text: string): string {
  const p = join(tmp(), name);
  writeFileSync(p, text);
  return p;
}

function start(args: string[], env: NodeJS.ProcessEnv = process.env): ChildProcess {
  const k = spawn(process.execPath, ['--import', 'tsx', ...args], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'inherit'] });
  kids.push(k);
  return k;
}

function firstLine(child: ChildProcess): Promise<string> {
  return new Promise((res) => {
    let buf = '';
    child.stdout?.on('data', (b: Buffer) => {
      buf += String(b);
      if (buf.includes('\n')) res(buf.slice(0, buf.indexOf('\n')));
    });
  });
}

function lines(child: ChildProcess): () => Promise<string> {
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
  return () => (queue.length ? Promise.resolve(queue.shift() as string) : new Promise((res) => waiting.push(res)));
}

/** Resolves 'stopped' once the child is in state T (SIGSTOP), or the line it printed when it never stopped. */
function stoppedOrLine(child: ChildProcess, line: Promise<string>): Promise<string> {
  return Promise.race([
    line,
    new Promise<string>((res) => {
      const poll = (): void => {
        let state = '';
        try {
          const stat = readFileSync(`/proc/${child.pid}/stat`, 'utf8');
          state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
        } catch {
          // gone
        }
        if (state === 'T') res('stopped');
        else setTimeout(poll, 2);
      };
      poll();
    }),
  ]);
}

function staleDir(withOldMarker: boolean): string {
  const dir = join(tmp(), 'data');
  mkdirSync(dir);
  writeFileSync(join(dir, 'instance.lock'), DEAD);
  if (withOldMarker) {
    writeFileSync(join(dir, 'instance.lock.sweep'), '');
    ageAll(dir);
  }
  return dir;
}

function ageAll(dir: string): void {
  const old = (Date.now() - 10000) / 1000;
  for (const f of readdirSync(dir)) utimesSync(join(dir, f), old, old);
}

/** S2 forced: S stops between its re-check and its removal of the stale lock; its marker is then aged; L starts (2 calls); S resumes. */
async function forcedS2(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const dir = staleDir(false);
  const file = script('start-child.mjs', START_CHILD);
  const s = start([file, dir, 'instance.lock', '2', '0'], env);
  const sLine = firstLine(s);
  const sState = await stoppedOrLine(s, sLine);
  if (sState === 'stopped') ageAll(dir);
  const l = start([file, dir, '-', '2', '0'], env);
  const lLine = await firstLine(l);
  s.kill('SIGCONT');
  const outs = [await sLine, lLine];
  for (const k of [s, l]) k.stdin?.end();
  return [...outs, readFileSync(join(dir, 'instance.lock'), 'utf8').trim()];
}

describe('a kernel lock gate closes the #299 residuals S2 and R2 (#316)', () => {
  it('1: WHEN a start is SIGSTOPped between its re-check and its removal of the stale lock `999999999`, its takeover marker is then aged 10 seconds, a second start calls acquireInstanceLock twice, and the first start is then resumed (S2) THEN exactly one of the two starts returns a lock, the other throws a message containing `it holds the instance lock`, and the lock file holds the winner\'s pid', async () => {
    const [s, l, lockText] = await forcedS2();
    const outs = [s, l];
    const winners = outs.filter((o) => o.startsWith('WON '));
    expect(winners, outs.join(' | ')).toHaveLength(1);
    expect(outs.filter((o) => o === 'REFUSED'), outs.join(' | ')).toHaveLength(1);
    expect(lockText).toBe(winners[0].slice(4));
  }, T_MS);

  it('2: WHEN `instance.lock` holds the dead pid `999999999` next to a takeover marker 10 seconds old, start Y is SIGSTOPped just before it removes that marker, start X then runs once, start Z is SIGSTOPped just before it removes the stale lock (or ends), Y is resumed and ends, start W then runs once, and Z is resumed (R2) THEN exactly one of the four starts returns a lock, every other throws a message containing `it holds the instance lock`, and the lock file holds the winner\'s pid', async () => {
    const dir = staleDir(true);
    const file = script('start-child.mjs', START_CHILD);
    const y = start([file, dir, 'instance.lock.sweep', '1', '0']);
    const yLine = firstLine(y);
    await stoppedOrLine(y, yLine);
    const x = start([file, dir, '-', '1', '0']);
    const xLine = await firstLine(x);
    const z = start([file, dir, 'instance.lock', '1', '0']);
    const zLine = firstLine(z);
    await stoppedOrLine(z, zLine);
    y.kill('SIGCONT');
    const yOut = await yLine;
    const w = start([file, dir, '-', '1', '0']);
    const wLine = await firstLine(w);
    z.kill('SIGCONT');
    const outs = [yOut, xLine, await zLine, wLine];
    for (const k of [y, x, z, w]) k.stdin?.end();
    const winners = outs.filter((o) => o.startsWith('WON '));
    expect(winners, outs.join(' | ')).toHaveLength(1);
    expect(outs.filter((o) => o === 'REFUSED'), outs.join(' | ')).toHaveLength(3);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(winners[0].slice(4));
  }, T_MS);

  it('3: WHEN a child that holds the instance lock is SIGKILLed THEN acquireInstanceLock in this process succeeds on the first call, the lock file holds this process\'s pid, and after release the dir holds no file', async () => {
    const dir = join(tmp(), 'data');
    mkdirSync(dir);
    const holder = start([script('start-child.mjs', START_CHILD), dir, '-', '1', '0']);
    const held = await firstLine(holder);
    expect(held).toBe(`WON ${holder.pid}`);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(String(holder.pid));
    const gone = new Promise<void>((res) => holder.once('exit', () => res()));
    holder.kill('SIGKILL');
    await gone;
    const lock = acquireInstanceLock(dir);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(String(process.pid));
    lock.release();
    expect(readdirSync(dir)).toEqual([]);
  }, T_MS);

  it('4: WHEN `/usr/bin/flock` cannot be run in either child (spawnSync of it fails with `ENOENT`) and two real child processes call acquireInstanceLock at the same instant on a lock holding the dead pid `999999999`, for 200 rounds THEN every round has exactly one child that returns a lock and one that throws a message containing `it holds the instance lock`, the lock file holds the winner\'s pid, and a start in the same state that finds a live owner reports one try of `/usr/bin/flock`', async () => {
    const base = tmp();
    const rounds = 200;
    for (let r = 0; r < rounds; r++) {
      mkdirSync(join(base, `d${r}`));
      writeFileSync(join(base, `d${r}`, 'instance.lock'), DEAD);
    }
    const file = script('race-child.mjs', RACE_CHILD);
    const pair = [start([file, base, String(rounds), '1']), start([file, base, String(rounds), '1'])];
    const io = pair.map(lines);
    await Promise.all(io.map((n) => n()));
    const t0 = Date.now() + 400;
    for (const k of pair) k.stdin?.write(`${t0}\n`);
    const [A, B] = (await Promise.all(io.map((n) => n()))).map((l) => JSON.parse(l) as { pid: number; out: string[] });
    for (const k of pair) k.stdin?.end();
    const bad: string[] = [];
    for (let r = 0; r < rounds; r++) {
      const pair2 = [A.out[r], B.out[r]].sort().join('');
      const lockText = readFileSync(join(base, `d${r}`, 'instance.lock'), 'utf8').trim();
      const want = A.out[r] === '1' ? String(A.pid) : String(B.pid);
      if (pair2 !== '1L' || lockText !== want) bad.push(`round ${r}: ${A.out[r]} ${B.out[r]} lock=${lockText}`);
    }
    expect(bad).toEqual([]);
    const live = join(tmp(), 'live');
    mkdirSync(live);
    writeFileSync(join(live, 'instance.lock'), String(process.pid));
    const probe = start([script('start-child.mjs', START_CHILD), live, '-', '1', '1']);
    expect(await firstLine(probe)).toBe('REFUSED flockRuns=1');
    probe.stdin?.end();
  }, T_MS);

  it('5: WHEN `/usr/bin/flock` cannot be run in either start (spawnSync of it fails with `ENOENT`) and the S2 interleaving of test 1 is forced THEN both starts return a lock (the #315 residual, kept unchanged as the fallback) and each start tried `/usr/bin/flock`', async () => {
    const dir = staleDir(false);
    const file = script('start-child.mjs', START_CHILD);
    const s = start([file, dir, 'instance.lock', '2', '1']);
    const sLine = firstLine(s);
    expect(await stoppedOrLine(s, sLine)).toBe('stopped');
    ageAll(dir);
    const l = start([file, dir, '-', '2', '1']);
    const lLine = await firstLine(l);
    s.kill('SIGCONT');
    const outs = [await sLine, lLine];
    for (const k of [s, l]) k.stdin?.end();
    expect(outs.sort()).toEqual([`WON ${l.pid} flockRuns=2`, `WON ${s.pid} flockRuns=1`].sort());
  }, T_MS);

  it('6: WHEN `PATH` is empty in both starts and the S2 interleaving of test 1 is forced THEN exactly one start returns a lock and the other throws a message containing `it holds the instance lock` (the gate runs `/usr/bin/flock` by its absolute path, never a PATH lookup)', async () => {
    const [s, l] = await forcedS2({ ...process.env, PATH: '' });
    const outs = [s, l];
    expect(outs.filter((o) => o.startsWith('WON ')), outs.join(' | ')).toHaveLength(1);
    expect(outs.filter((o) => o === 'REFUSED'), outs.join(' | ')).toHaveLength(1);
  }, T_MS);

  it('7: WHEN four real child processes call acquireInstanceLock at the same instant on a lock holding the dead pid `999999999`, for 150 rounds THEN in every round exactly one child returns a lock, the other three throw a message containing `it holds the instance lock`, the lock file holds the winner\'s pid, and the dir holds no other file', async () => {
    const base = tmp();
    const rounds = 150;
    for (let r = 0; r < rounds; r++) {
      mkdirSync(join(base, `d${r}`));
      writeFileSync(join(base, `d${r}`, 'instance.lock'), DEAD);
    }
    const file = script('race-child.mjs', RACE_CHILD);
    const four = [0, 1, 2, 3].map(() => start([file, base, String(rounds), '0']));
    const io = four.map(lines);
    await Promise.all(io.map((n) => n()));
    const t0 = Date.now() + 600;
    for (const k of four) k.stdin?.write(`${t0}\n`);
    const reports = (await Promise.all(io.map((n) => n()))).map((l) => JSON.parse(l) as { pid: number; out: string[] });
    const bad: string[] = [];
    for (let r = 0; r < rounds; r++) {
      const outs = reports.map((p) => p.out[r]);
      const winner = reports.find((p) => p.out[r] === '1');
      const files = readdirSync(join(base, `d${r}`));
      const lockText = existsSync(join(base, `d${r}`, 'instance.lock')) ? readFileSync(join(base, `d${r}`, 'instance.lock'), 'utf8').trim() : '';
      if (outs.filter((o) => o === '1').length !== 1 || outs.filter((o) => o === 'L').length !== 3 || lockText !== String(winner?.pid) || files.join(',') !== 'instance.lock') {
        bad.push(`round ${r}: ${outs.join('')} lock=${lockText} files=${files.join(',')}`);
      }
    }
    for (const k of four) k.stdin?.end();
    expect(bad).toEqual([]);
  }, T_MS);

  it('8: WHEN the data dir is a symbolic link to a real dir and this process acquires the lock through the link THEN it succeeds, the real dir\'s `instance.lock` holds this process\'s pid, and a child start on the same link throws a message containing `it holds the instance lock`', async () => {
    const real = join(tmp(), 'real');
    mkdirSync(real);
    const link = join(tmp(), 'link');
    symlinkSync(real, link);
    const lock = acquireInstanceLock(link);
    try {
      expect(readFileSync(join(real, 'instance.lock'), 'utf8').trim()).toBe(String(process.pid));
      const other = start([script('start-child.mjs', START_CHILD), link, '-', '1', '0']);
      expect(await firstLine(other)).toBe('REFUSED');
      other.stdin?.end();
    } finally {
      lock.release();
    }
  }, T_MS);

  it('9: WHEN `/usr/bin/flock` cannot be run in either start (spawnSync of it fails with `ENOENT`) and the interleaving of #299 race test 9 is forced (a start takes the takeover marker after another start has already removed the stale lock, and that other start creates its fresh lock while the first is between its re-check and its removal step) THEN the fresh lock is not removed: exactly one of the two starts returns a lock and the lock file holds its pid', async () => {
    const dir = staleDir(false);
    const hook = start([script('hook-child.mjs', HOOK_CHILD), dir]);
    const hookLine = firstLine(hook);
    expect(await stoppedOrLine(hook, hookLine)).toBe('stopped');
    const other = start([script('start-child.mjs', START_CHILD), dir, '-', '1', '1']);
    const otherLine = await firstLine(other);
    hook.kill('SIGCONT');
    const outs = [await hookLine, otherLine];
    for (const k of [hook, other]) k.stdin?.end();
    const winners = outs.filter((o) => o.startsWith('WON '));
    expect(winners, outs.join(' | ')).toHaveLength(1);
    expect(outs.filter((o) => o.startsWith('REFUSED ')), outs.join(' | ')).toHaveLength(1);
    expect(outs.every((o) => o.endsWith(' flockRuns=1')), outs.join(' | ')).toBe(true);
    expect(readFileSync(join(dir, 'instance.lock'), 'utf8').trim()).toBe(winners[0].split(' ')[1]);
  }, T_MS);
});
