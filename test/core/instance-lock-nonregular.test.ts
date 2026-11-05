/**
 * #676: a FIFO or other non-regular file at `instance.lock` must not make a start or `snote --new` wait. The lock
 * owner is read through one descriptor opened without following a link and without waiting on a pipe, then fstat-ed
 * (readRegularText); a path that is not a regular file reads as no owner. The wait cases run in a child process so a
 * regression shows as a missing answer after 2000 ms (an assertion), never as a hung test run. The files are real.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRegularText } from '../../src/core/secure-fs';

const ROOT = process.cwd();
const LOCK_TS = path.join(ROOT, 'src', 'core', 'instance-lock.ts');
const SFS_TS = path.join(ROOT, 'src', 'core', 'secure-fs.ts');
const REQ_TS = path.join(ROOT, 'src', 'core', 'new-request.ts');

describe('#676 a non-regular file at the lock path never makes a start wait', () => {
  let tmp: string;
  let dir: string;
  const kids: ReturnType<typeof spawn>[] = [];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-676-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(dir);
  });

  afterEach(() => {
    for (const k of kids.splice(0)) k.kill('SIGKILL');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const fifo = (p: string): void => {
    expect(spawnSync('mkfifo', [p]).status).toBe(0);
  };

  /** Run `code` (ESM) in a child; resolve with its stdout once it holds a line, or '' after 2000 ms. */
  const answer = (code: string): Promise<string> => {
    const child = spawn(process.execPath, ['--import', 'tsx', '-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
    kids.push(child);
    return new Promise((resolve) => {
      let out = '';
      const timer = setTimeout(() => resolve(''), 2000);
      child.stdout?.on('data', (b: Buffer) => {
        out += String(b);
        if (out.includes('\n')) {
          clearTimeout(timer);
          resolve(out.trim());
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(out.trim());
      });
    });
  };

  const start = `const { acquireInstanceLock } = await import(${JSON.stringify(LOCK_TS)}); try { const l = acquireInstanceLock('DIR'); l.release(); console.log('held'); } catch (e) { console.log('refused: ' + e.message); } process.exit(0);`;

  it('1: WHEN `instance.lock` is a FIFO written just now and a start runs THEN it answers `held` within 2000 ms (the odd file is replaced, as a symlink there is) and, after release, the folder is empty', async () => {
    fifo(path.join(dir, 'instance.lock'));
    expect(await answer(start.replace('DIR', dir))).toBe('held');
    expect(fs.readdirSync(dir)).toEqual([]);
  }, 20000);

  it('2: WHEN `instance.lock` is a FIFO holding the pid of a live process (its writer has gone) and a start runs THEN it answers `held` within 2000 ms: the pipe text is not taken as an owner', async () => {
    const holder = spawn('sleep', ['30'], { stdio: 'ignore' });
    kids.push(holder);
    const p = path.join(dir, 'instance.lock');
    fifo(p);
    const keep = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK); // holds the pipe's buffer
    try {
      const w = fs.openSync(p, fs.constants.O_WRONLY);
      fs.writeSync(w, String(holder.pid));
      fs.closeSync(w);
      expect(await answer(start.replace('DIR', dir))).toBe('held');
    } finally {
      fs.closeSync(keep);
    }
  }, 20000);

  it('3: WHEN `instance.lock` is a FIFO and requestNewNote runs THEN it answers `no-instance` within 2000 ms and the FIFO stays', async () => {
    fifo(path.join(dir, 'instance.lock'));
    const code = `const { requestNewNote } = await import(${JSON.stringify(REQ_TS)}); console.log(requestNewNote(${JSON.stringify(dir)})); process.exit(0);`;
    expect(await answer(code)).toBe('no-instance');
    expect(fs.lstatSync(path.join(dir, 'instance.lock')).isFIFO()).toBe(true);
  }, 20000);

  it('4: WHEN a live start holds the lock and `new-note.request` is a FIFO and requestNewNote runs THEN it answers `sent` within 2000 ms and the request is now a regular file (already safe at the base: the temp file is renamed over the FIFO, nothing opens it)', async () => {
    const holder = spawn('sleep', ['30'], { stdio: 'ignore' });
    kids.push(holder);
    fs.writeFileSync(path.join(dir, 'instance.lock'), String(holder.pid));
    fifo(path.join(dir, 'new-note.request'));
    const code = `const { requestNewNote } = await import(${JSON.stringify(REQ_TS)}); console.log(requestNewNote(${JSON.stringify(dir)})); process.exit(0);`;
    expect(await answer(code)).toBe('sent');
    expect(fs.lstatSync(path.join(dir, 'new-note.request')).isFile()).toBe(true);
  }, 20000);

  it('5: WHEN a FIFO holds the text `4242` and its writer has gone and readRegularText reads it THEN it answers `null` within 2000 ms, not the pipe text', async () => {
    const p = path.join(dir, 'instance.lock');
    fifo(p);
    const keep = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK); // holds the pipe's buffer
    try {
      const w = fs.openSync(p, fs.constants.O_WRONLY);
      fs.writeSync(w, '4242');
      fs.closeSync(w);
      const code = `const { readRegularText } = await import(${JSON.stringify(SFS_TS)}); console.log(String(readRegularText(${JSON.stringify(p)}))); process.exit(0);`;
      expect(await answer(code)).toBe('null');
    } finally {
      fs.closeSync(keep);
    }
  }, 20000);

  it('6: WHEN readRegularText reads a regular file, a symlink to it, a folder and a missing path THEN it returns the text, then null, null, and an empty string', () => {
    const file = path.join(tmp, 'f');
    fs.writeFileSync(file, '1234');
    fs.symlinkSync(file, path.join(tmp, 'link'));
    expect([readRegularText(file), readRegularText(path.join(tmp, 'link')), readRegularText(dir), readRegularText(path.join(tmp, 'none'))]).toEqual(['1234', null, null, '']);
  });
});
