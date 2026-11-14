/**
 * #818: scripts/first-frame.mjs measures cold start to first frame in ms. Tests 1 to 3 cover its parsing; tests 4 and 6
 * to 10 call measure() in-process on stand-in cli.js files (async, so the 3 s test timeout applies), and test 5 runs
 * the script itself, also async. No build and no network.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hasFrame, measure, median, parseArgs, visibleText } from '../../scripts/first-frame.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const standIn = (body: string): string => {
  const d = mkdtempSync(join(tmpdir(), 'snote-818-'));
  dirs.push(d);
  writeFileSync(join(d, 'cli.js'), body);
  return join(d, 'cli.js');
};
const FRAME = "process.stdout.write('\\x1b[2J\\x1b[1mSign in to Simplenote\\x1b[0m\\n'); setTimeout(() => {}, 2000);\n";
// Like the real launcher: a compile-cache dir under XDG_CACHE_HOME; logs whether it held a file at start, then fills it.
const CACHING =
  "const fs = require('node:fs'); const path = require('node:path');\n" +
  "const d = path.join(process.env.XDG_CACHE_HOME, 'snote', 'compile-cache'); fs.mkdirSync(d, { recursive: true });\n" +
  "fs.appendFileSync(path.join(__dirname, 'runs.log'), (fs.readdirSync(d).length ? 'filled' : 'empty') + '\\n');\n" +
  "fs.writeFileSync(path.join(d, 'entry'), 'x');\n" +
  FRAME;
// Shaped like the real launcher (scripts/build.mjs writeLauncher): it turns on node's compile cache and imports a second
// module, and writes nothing itself. Node writes that cache only as the process ends through its own exit path, never
// on load; like snote (#689), a SIGHUP listener re-raises the signal, here 300 ms after the SIGHUP, so the cache fills
// only at the end of the run. It logs whether the cache held a file at its start.
const LAUNCHER =
  "import * as nodeModule from 'node:module'; import * as fs from 'node:fs'; import { join } from 'node:path';\n" +
  "const d = join(process.env.XDG_CACHE_HOME, 'snote', 'compile-cache'); fs.mkdirSync(d, { recursive: true });\n" +
  'const held = fs.readdirSync(d, { recursive: true, withFileTypes: true }).some((e) => e.isFile());\n' +
  "fs.appendFileSync(new URL('runs.log', import.meta.url), (held ? 'filled' : 'empty') + '\\n');\n" +
  'nodeModule.enableCompileCache(d);\n' +
  "await import('./second.mjs');\n" +
  "process.on('SIGHUP', () => setTimeout(() => { process.removeAllListeners('SIGHUP'); process.kill(process.pid, 'SIGHUP'); }, 300));\n" +
  FRAME;
// Logs `start` to ends.log when it starts and `end` 300 ms after its SIGHUP, then exits: a run that overlaps the next
// shows two `start` lines in a row. It fills its compile-cache dir as CACHING does, so measure goes on past the warm-up.
const ENDS_LATE =
  "const endsLog = (line) => require('node:fs').appendFileSync(require('node:path').join(__dirname, 'ends.log'), line);\n" +
  "endsLog('start\\n');\n" +
  "process.on('SIGHUP', () => setTimeout(() => { endsLog('end\\n'); process.exit(0); }, 300));\n" +
  CACHING;
// Ignores SIGHUP, so its run does not end until it is killed.
const NO_END = "process.on('SIGHUP', () => {});\n" + FRAME;
// Ignores SIGHUP and, before its frame, rewrites every pid file of the run (pid-*/pid beside its HOME) to a pid that is
// not its own, so the SIGHUP and the SIGKILL by pid reach nothing; it exits once script(1) is gone (its parent changes),
// and after 5 s at the latest.
const WRONG_PID =
  "const fs = require('node:fs'); const path = require('node:path'); const r = path.dirname(process.env.HOME);\n" +
  "for (const d of fs.readdirSync(r)) if (d.startsWith('pid-')) fs.writeFileSync(path.join(r, d, 'pid'), '2147483647');\n" +
  'const pp = process.ppid; setInterval(() => { if (process.ppid !== pp) process.exit(0); }, 50); setTimeout(() => process.exit(0), 5000);\n' +
  NO_END;
const run = (...args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const c = spawn(process.execPath, [join(process.cwd(), 'scripts', 'first-frame.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 2900 });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    c.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    c.on('close', (status) => resolve({ status, stdout, stderr }));
  });

describe('#818 scripts/first-frame.mjs', () => {
  it('1: WHEN output is `\\x1b[2J\\x1b[1mSign in\\x1b[0m` THEN its visible text is `Sign in` and it is a frame; `\\x1b[?25l\\x1b[2J\\x1b]0;t\\x07ab` is not', () => {
    expect(visibleText('\x1b[2J\x1b[1mSign in\x1b[0m')).toBe('Sign in');
    expect(hasFrame('\x1b[2J\x1b[1mSign in\x1b[0m')).toBe(true);
    expect(hasFrame('\x1b[?25l\x1b[2J\x1b]0;title\x07ab')).toBe(false);
  });

  it('2: WHEN median is taken of `[3, 1, 2]` and of `[4, 1, 3, 2]` THEN it is `2` and `2.5`', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('3: WHEN no option is given THEN runs is `12`; WHEN `--runs 0`, `--limit x` or `--fast` is given THEN it throws', () => {
    expect(parseArgs([])).toEqual({ runs: 12, cli: '', limit: 0, json: false });
    expect(() => parseArgs(['--runs', '0'])).toThrow('--runs needs a whole number');
    expect(() => parseArgs(['--limit', 'x'])).toThrow('--limit needs a whole number');
    expect(() => parseArgs(['--fast'])).toThrow('unknown option --fast');
  });

  it('4: WHEN measure runs a stand-in cli.js that draws `Sign in to Simplenote` once THEN cold, warm and baseline medians are above 0 ms and load1 is a number', async () => {
    const r = await measure(standIn(CACHING), 1);
    expect(r.runs).toBe(1);
    expect(r.coldMedianMs).toBeGreaterThan(0);
    expect(r.warmMedianMs).toBeGreaterThan(0);
    expect(r.nodeBaselineMedianMs).toBeGreaterThan(0);
    expect(r.load1).toBeGreaterThanOrEqual(0);
  });

  it('5: WHEN a stand-in cli.js exits without printing THEN the script exits `1` and stderr says `first-frame: no frame`', async () => {
    const r = await run('--cli', standIn('process.exit(0);\n'), '--runs', '1');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('first-frame: no frame');
    expect(r.stdout).toBe('');
  });

  it('6: WHEN measure runs a stand-in that fills its compile-cache dir THEN its runs see the cache `empty`, `empty`, `filled` (warm-up, cold, warm) and warmCacheFiles is `1`', async () => {
    const cli = standIn(CACHING);
    const r = await measure(cli, 1);
    expect(readFileSync(join(cli, '..', 'runs.log'), 'utf8')).toBe('empty\nempty\nfilled\n');
    expect(r.warmCacheFiles).toBe(1);
  });

  it('7: WHEN the warm-up run leaves the compile-cache dir empty THEN measure rejects with `first-frame: warm cache is empty`', async () => {
    await expect(measure(standIn(FRAME), 1)).rejects.toThrow('first-frame: warm cache is empty');
  });

  it('8: WHEN measure runs a launcher-shaped stand-in whose compile cache node writes only on its exit path, after its SIGHUP, THEN its runs see the cache `empty`, `empty`, `filled` and warmCacheFiles is at least `1`', async () => {
    const d = mkdtempSync(join(tmpdir(), 'snote-818-'));
    dirs.push(d);
    writeFileSync(join(d, 'second.mjs'), 'export const twice = (n) => n * 2;\n');
    writeFileSync(join(d, 'cli.mjs'), LAUNCHER);
    const r = await measure(join(d, 'cli.mjs'), 1);
    expect(readFileSync(join(d, 'runs.log'), 'utf8')).toBe('empty\nempty\nfilled\n');
    expect(r.warmCacheFiles).toBeGreaterThanOrEqual(1);
  });

  it('9: WHEN each run of a stand-in logs `end` on its way out after its SIGHUP THEN its log reads `start`, `end` three times (warm-up, cold, warm) when measure returns', async () => {
    const cli = standIn(ENDS_LATE);
    await measure(cli, 1);
    expect(readFileSync(join(cli, '..', 'ends.log'), 'utf8')).toBe('start\nend\nstart\nend\nstart\nend\n');
  });

  it('10: WHEN a stand-in ignores SIGHUP THEN measure rejects with `after its SIGHUP; it was killed and the run does not count`', async () => {
    await expect(measure(standIn(NO_END), 1, { endWaitMs: 300 })).rejects.toThrow('after its SIGHUP; it was killed and the run does not count');
  });

  it('11: WHEN a stand-in ignores SIGHUP and rewrites every pid-*/pid under dirname(HOME) to 2147483647 THEN measure rejects with `after its SIGHUP; it was killed`', async () => {
    await expect(measure(standIn(WRONG_PID), 1, { endWaitMs: 300 })).rejects.toThrow('after its SIGHUP; it was killed');
  });
});
