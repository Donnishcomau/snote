/**
 * #818: start time in milliseconds, cold start to first frame.
 *
 * node scripts/first-frame.mjs [--runs N] [--cli <cli.js>] [--limit <ms>] [--json]
 *
 * Builds the split plugin-dist (the files a user runs) into a temp dir, unless --cli names a built cli.js, then
 * starts `node <cli.js>` in a pseudo-terminal (script(1)) with an isolated HOME and XDG dirs under a temp dir, so
 * no real data dir is read and nothing is sent: an empty HOME shows the sign-in screen, which needs no network.
 * A run ends at the first frame: the first output whose visible text (ANSI sequences removed) holds a word of four
 * or more letters. The script then sends the measured node SIGHUP (what closing the terminal window sends) and waits
 * until it has exited (script(1) closes only after its child is gone), so a run never overlaps the next one and node
 * has written its compile cache (on that exit path) before it is counted. Cold = a fresh XDG_CACHE_HOME per run (no
 * compile cache); warm = one cache dir reused after a warm-up run filled it (the script fails when the warm-up run
 * left it empty, so warm is never a second cold number); baseline = a bare node that writes one word, with the same
 * first-output endpoint. Prints the cold and warm medians, the warm cache file count, the baseline median and the
 * 1-minute host load (the number moves with load) in ms (or one JSON object with --json). A run with no frame (the
 * child exits first, or nothing within 10 s) ends the script with exit 1 and `first-frame: no frame ...` on stderr; an
 * empty warm cache ends it with exit 1 and `first-frame: warm cache is empty ...`; a run still running 2 s after its
 * SIGHUP is killed (SIGKILL) and ends it with exit 1 and `first-frame: ... still running ...`; --limit <ms> exits 3
 * when the cold median is above it (the release row, #818: 70 ms on snote-ci). Usage errors exit 2.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const FRAME_TIMEOUT_MS = 10000;
/** How long a run may take to exit after its SIGHUP before it is killed and the script fails. */
const END_TIMEOUT_MS = 2000;
/** The bare-node baseline: start node, write one word (a frame), as the frame runs do. */
const BASELINE = "process.stdout.write('node ready\\n'); setTimeout(() => {}, 2000);";

/** The printable text of terminal output: CSI, OSC and two-byte escape sequences removed. */
export function visibleText(raw) {
  return raw.replace(/\x1b\[[0-9;?<>=!]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g, '');
}

/** True when the output so far holds a frame: a run of four or more letters in its visible text. */
export function hasFrame(raw) {
  return /[A-Za-z]{4,}/.test(visibleText(raw));
}

/** The median (the mean of the middle two for an even count); NaN for an empty list. */
export function median(xs) {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Parse the command line; throws an Error with a usage message on a bad option. */
export function parseArgs(argv) {
  const o = { runs: 12, cli: '', limit: 0, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--runs' || a === '--limit') {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1) throw new Error(`first-frame: ${a} needs a whole number of 1 or more`);
      if (a === '--runs') o.runs = v;
      else o.limit = v;
    } else if (a === '--cli') {
      const v = argv[++i];
      if (!v) throw new Error('first-frame: --cli needs a path');
      o.cli = path.resolve(v);
    } else throw new Error(`first-frame: unknown option ${a} (usage: [--runs N] [--cli <cli.js>] [--limit <ms>] [--json])`);
  }
  return o;
}

const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * script(1) arguments that run `cmd` (argv) in a 100x30 pty through /bin/sh, which writes its pid to `pidFile` and then
 * execs `cmd`, so that pid is the measured process: util-linux on Linux, BSD script elsewhere.
 */
function ptyArgs(cmd, pidFile) {
  const sh = `echo $$ > ${shq(pidFile)}; exec ${cmd.map(shq).join(' ')}`;
  if (process.platform === 'linux') return ['-qfec', `stty cols 100 rows 30; ${sh}`, '/dev/null'];
  return ['-q', '/dev/null', '/bin/sh', '-c', sh];
}

/** An isolated environment under `home`: HOME and every XDG dir inside it, a fixed terminal size. */
function isolatedEnv(home, cache) {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, 'config'),
    XDG_DATA_HOME: path.join(home, 'data'),
    XDG_STATE_HOME: path.join(home, 'state'),
    XDG_CACHE_HOME: cache,
    SNOTE_STATUS_DIR: path.join(home, 'status'),
    TERM: 'xterm-256color',
    COLUMNS: '100',
    LINES: '30',
  };
}

/**
 * Start `cmd` in a pty. At its first frame, or when none comes within FRAME_TIMEOUT_MS, send the measured process
 * (the pid in `pidFile`) SIGHUP; resolve once script(1) has closed, which it does only after that process has exited.
 * `ms` is the ms to the first frame (-1 when it exits or times out with none); `ended` is false when the process was
 * still running `endWaitMs` after its SIGHUP and was killed (SIGKILL) instead.
 */
function timeToFrame(cmd, env, pidFile, endWaitMs) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const child = spawn('script', ptyArgs(cmd, pidFile), { env, stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    let ms = -1;
    let ended = true;
    let stopping = false;
    let endTimer;
    const pid = () => {
      try {
        const p = Number(fs.readFileSync(pidFile, 'utf8'));
        return Number.isSafeInteger(p) && p > 1 ? p : 0;
      } catch {
        return 0;
      }
    };
    // pid 0 (no pid written yet, or not a whole number above 1) signals script(1) itself, never process group 0 or pid 1.
    const kill = (p, sig) => {
      try {
        if (p > 0) process.kill(p, sig);
        else child.kill(sig);
      } catch {
        // already gone
      }
    };
    const stop = (v) => {
      if (stopping) return;
      stopping = true;
      ms = v;
      clearTimeout(frameTimer);
      const p = pid();
      kill(p, p > 0 ? 'SIGHUP' : 'SIGKILL');
      endTimer = setTimeout(() => {
        ended = false;
        kill(pid(), 'SIGKILL');
        child.kill('SIGKILL');
      }, endWaitMs);
    };
    const frameTimer = setTimeout(() => stop(-1), FRAME_TIMEOUT_MS);
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      if (!stopping && hasFrame(buf)) stop(Number(process.hrtime.bigint() - t0) / 1e6);
    });
    const done = () => {
      clearTimeout(frameTimer);
      clearTimeout(endTimer);
      resolve({ ms, ended });
    };
    child.on('error', done);
    child.on('close', done);
  });
}

/** The number of regular files under `dir`, which must exist (measure makes every cache dir; a missing one throws ENOENT). */
function cacheFiles(dir) {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
}

/**
 * Measure `runs` cold and warm first frames of `cli` and the bare-node baseline; throws when a run has no frame, a run
 * is still running `endWaitMs` after its SIGHUP, or the warm-up run leaves the warm cache empty.
 */
export async function measure(cli, runs, { endWaitMs = END_TIMEOUT_MS } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-first-frame-'));
  try {
    const fresh = (name) => fs.mkdtempSync(path.join(root, `${name}-`));
    const frame = async (cmd, cache) => {
      const r = await timeToFrame(cmd, isolatedEnv(fresh('home'), cache), path.join(fresh('pid'), 'pid'), endWaitMs);
      if (r.ms < 0) throw new Error(`first-frame: no frame from ${cmd.at(-1)} within ${FRAME_TIMEOUT_MS} ms (it exited or printed no text)`);
      if (!r.ended) throw new Error(`first-frame: ${cmd.at(-1)} was still running ${endWaitMs} ms after its SIGHUP; it was killed and the run does not count`);
      return r.ms;
    };
    const baseline = [];
    for (let i = 0; i < runs; i++) baseline.push(await frame([process.execPath, '-e', BASELINE], fresh('cache')));
    const warmCache = fresh('cache');
    await frame([process.execPath, cli], warmCache);
    const warmCacheFiles = cacheFiles(warmCache);
    if (warmCacheFiles === 0) throw new Error(`first-frame: warm cache is empty after the warm-up run (${warmCache}); warm would be a second cold number`);
    const cold = [];
    const warm = [];
    for (let i = 0; i < runs; i++) {
      cold.push(await frame([process.execPath, cli], fresh('cache')));
      warm.push(await frame([process.execPath, cli], warmCache));
    }
    return {
      runs,
      coldMedianMs: median(cold),
      coldMinMs: Math.min(...cold),
      warmMedianMs: median(warm),
      warmCacheFiles,
      nodeBaselineMedianMs: median(baseline),
      node: process.version,
      load1: Number(os.loadavg()[0].toFixed(2)),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 2;
  }
  let dist = '';
  try {
    let cli = o.cli;
    if (!cli) {
      const { buildPluginDist } = await import('./build-plugin-dist.mjs');
      dist = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-first-frame-dist-'));
      await buildPluginDist(dist);
      cli = path.join(dist, 'cli.js');
    }
    const r = await measure(cli, o.runs);
    const f = (n) => n.toFixed(1);
    if (o.json) process.stdout.write(`${JSON.stringify(r)}\n`);
    else
      process.stdout.write(
        `first-frame: cold median ${f(r.coldMedianMs)} ms (min ${f(r.coldMinMs)}), warm median ${f(r.warmMedianMs)} ms (cache ${r.warmCacheFiles} files), bare node median ${f(r.nodeBaselineMedianMs)} ms, ${r.runs} runs, node ${r.node}, load ${r.load1}\n`,
      );
    if (o.limit && r.coldMedianMs > o.limit) {
      process.stderr.write(`first-frame: cold median ${f(r.coldMedianMs)} ms is above the ${o.limit} ms limit\n`);
      return 3;
    }
    return 0;
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  } finally {
    if (dist) fs.rmSync(dist, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
