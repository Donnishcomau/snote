/**
 * Issues #341, #342 and #30, lane L5c: the one-key update of a direct install (src/core/direct-download.ts).
 * The running version is the installed build's own VERSION; the release check's 24 h cache holds only a time and a
 * version and decides only the offer; after y and a save that held, snote downloads again with the installed keys and
 * pipes `<sha256> <version>` and the verified bytes to the build's own update-helper with `--from-stdin` only.
 * Test 7 runs the real packaging/direct/install as that helper and waits for it to exit (Linux only: flock, GNU tar). No network.
 * Test 8 starts a stand-in helper with node's own spawn and reads its session from /proc (Linux only); test 9 runs the release
 * check end to end through startDirectWatch with a signed list served by a stubbed fetch.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { directNewest, installedBuild, readSavedCheck, startDirectHandOff, startDirectWatch } from '../../src/core/direct-download';
import { currentBanner, resetBanner } from '../../src/core/update-banner';
import { startHandOff } from '../../src/core/update-handoff';
import { startUpdateWatch } from '../../src/core/update-watch';
import { logout } from '../../src/core/token';

const NOT_SAVED = 'snote did not update: your notes could not be saved';
const NO_HELPER = 'snote did not update: the update script was not found';
const FAILED = 'snote did not update: the update could not be downloaded and checked';
const DOWNLOADING = 'snote is downloading the update and checking its signature';
const DIRECT_CHECK_FILE = 'direct-release-check.json';
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let home: string;
let app: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'l5c-'));
  app = path.join(home, '.local', 'share', 'snote-app', 'app');
  fs.mkdirSync(app, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(app, 'cli.js'), "console.log('snote 0.2.11');\n");
  fs.writeFileSync(path.join(app, 'VERSION'), '0.2.11\n');
  fs.writeFileSync(path.join(app, 'allowed_signers'), '# keys\n');
  fs.writeFileSync(path.join(app, 'update-helper'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetBanner();
  fs.rmSync(home, { recursive: true, force: true });
});
const entry = (): string => path.join(app, 'cli.js');

type Call = { cmd: string; args: string[]; opts: Record<string, unknown>; stdin: Buffer[]; unrefs: number };
/** A spawn stand-in: records the call, what was written to stdin and each unref; `epipe` makes the stdin write fail. */
function fakeSpawn(calls: Call[], epipe = false) {
  return ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    const call: Call = { cmd, args, opts, stdin: [], unrefs: 0 };
    calls.push(call);
    const stdin = new Writable({
      write(chunk: Buffer, _enc, done) {
        call.stdin.push(chunk);
        done(epipe ? Object.assign(new Error('EPIPE'), { code: 'EPIPE' }) : null);
      },
    });
    return Object.assign(new EventEmitter(), { stdin, unref: () => void (call.unrefs += 1) });
  }) as never;
}
const okDownload = (bytes: Buffer, seen: unknown[] = []) => async (o: unknown) => (seen.push(o), { ok: true as const, version: '0.2.12', commit: 'c'.repeat(40), bytes });
let keys = 0;
/** The signed list of release `version` naming `bytes`, served by a stubbed global fetch (no socket); a real ssh-keygen key signs it, and the installed allowed_signers holds that key and one more (two keys: the installed file's rule). */
function serveSignedRelease(version: string, bytes: Buffer): void {
  const keygen = (args: string[]) => execFileSync('/usr/bin/ssh-keygen', args, { cwd: home, env: { PATH: '/usr/bin:/bin', HOME: home }, stdio: 'pipe' });
  const signer = (f: string): string => (keygen(['-q', '-t', 'ed25519', '-N', '', '-f', f]), `snote-release namespaces="snote-release" ${fs.readFileSync(`${f}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ')} k\n`);
  const key = path.join(home, `k${++keys}`);
  fs.writeFileSync(path.join(app, 'allowed_signers'), signer(key) + signer(`${key}b`));
  const list = path.join(home, `list${keys}`);
  fs.writeFileSync(list, `snote-assets ${version} ${'c'.repeat(40)}\n${sha(bytes)}  snote-${version}.tar.gz\n${'d'.repeat(64)}  snote-install\n`);
  keygen(['-Y', 'sign', '-f', key, '-n', 'snote-release', list]);
  const rel = 'https://github.com/Donnishcomau/snote/releases/';
  const served: Record<string, Buffer> = { [`${rel}latest/download/ASSETS.SHA256SUMS`]: fs.readFileSync(list), [`${rel}latest/download/ASSETS.SHA256SUMS.sig`]: fs.readFileSync(`${list}.sig`), [`${rel}download/v${version}/snote-${version}.tar.gz`]: bytes };
  vi.stubGlobal('fetch', async (u: string) => new Response(served[String(u)] === undefined ? null : new Uint8Array(served[String(u)]), { status: served[String(u)] === undefined ? 404 : 200 }));
}
/** The process group and session of a process, from /proc/<pid>/stat (the fields after the name). */
const groupOf = (stat: string): { pgrp: number; sid: number } => {
  const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return { pgrp: Number(f[2]), sid: Number(f[3]) };
};

describe('#30 L5c: the direct install update', () => {
  it('1: WHEN installedBuild is asked THEN the version is the trimmed VERSION file of the real app folder that holds the entry, and a VERSION that is a symlink, a FIFO, over 64 bytes or not plain digits, or an entry outside that folder, gives null', () => {
    expect(installedBuild(entry(), home)).toEqual({ appDir: fs.realpathSync(app), version: '0.2.11' });
    const sib = path.join(home, '.local', 'share', 'snote-app', 'app2');
    fs.mkdirSync(sib);
    fs.writeFileSync(path.join(sib, 'cli.js'), '');
    fs.writeFileSync(path.join(sib, 'VERSION'), '0.2.11\n');
    expect(installedBuild(path.join(sib, 'cli.js'), home)).toBeNull();
    const v = path.join(app, 'VERSION');
    const bad: Array<() => void> = [
      () => (fs.rmSync(v), fs.writeFileSync(path.join(home, 'v'), '0.2.11\n'), fs.symlinkSync(path.join(home, 'v'), v)),
      () => (fs.rmSync(v), spawnSync('mkfifo', [v])),
      () => (fs.rmSync(v), fs.writeFileSync(v, '0.2.11' + ' '.repeat(60) + '\n')),
      () => (fs.rmSync(v), fs.writeFileSync(v, '0.2.11-beta\n')),
    ];
    for (const make of bad) {
      make();
      expect(installedBuild(entry(), home)).toBeNull();
    }
  });

  it('2: WHEN direct-release-check.json is a symlink, over 4 KiB, not JSON, an array, holds a key other than checkedAt and version (also __proto__), a wrong type, a checkedAt in the future or 24 h old, or a version that is not plain digits THEN readSavedCheck gives null; a fresh `{checkedAt, version}` gives the version', () => {
    const file = path.join(home, DIRECT_CHECK_FILE);
    const fresh = JSON.stringify({ checkedAt: NOW - 1000, version: '0.2.12' });
    fs.writeFileSync(file, fresh);
    expect(readSavedCheck(file, NOW)).toBe('0.2.12');
    const cases: Array<string | (() => void)> = [
      () => (fs.writeFileSync(path.join(home, 't'), fresh), fs.symlinkSync(path.join(home, 't'), file)),
      fresh + ' '.repeat(4097 - fresh.length),
      '{"checkedAt":',
      JSON.stringify([NOW, '0.2.12']),
      JSON.stringify({ checkedAt: NOW - 1000, version: '0.2.12', url: 'https://x' }),
      `{"checkedAt":${NOW - 1000},"version":"0.2.12","__proto__":{"x":1}}`,
      JSON.stringify({ checkedAt: String(NOW - 1000), version: '0.2.12' }),
      JSON.stringify({ checkedAt: NOW + 1000, version: '0.2.12' }),
      JSON.stringify({ checkedAt: NOW - DAY, version: '0.2.12' }),
      JSON.stringify({ checkedAt: NOW - 1000, version: '0.2.12\u001b[31m' }),
      JSON.stringify({ checkedAt: NOW - 1000, version: '../0.2.12' }),
    ];
    for (const c of cases) {
      fs.rmSync(file, { force: true });
      if (typeof c === 'string') fs.writeFileSync(file, c);
      else c();
      expect([c.toString().slice(0, 40), readSavedCheck(file, NOW)]).toEqual([c.toString().slice(0, 40), null]);
    }
  });

  it('3: WHEN the release check runs with no fresh cache THEN it asks the signed list with the installed version and keys, writes the cache (mode 0600, exactly `{checkedAt, version}`) only after that verified, writes nothing after a failure, and the watch shows `0.2.11` -> `0.2.12`; with a fresh cache it asks nothing', async () => {
    const build = installedBuild(entry(), home)!;
    const file = path.join(home, DIRECT_CHECK_FILE);
    const failed = await directNewest({ dataDir: home, build, now: () => NOW, list: async () => 'The release list signature did not verify.' });
    expect([failed, fs.existsSync(file)]).toEqual([null, false]);
    const asked: unknown[] = [];
    const list = async (o: unknown) => (asked.push(o), { version: '0.2.12' });
    expect(await directNewest({ dataDir: home, build, now: () => NOW, list })).toEqual({ version: '0.2.12' });
    expect(asked).toEqual([{ runningVersion: '0.2.11', allowedSignersPath: path.join(build.appDir, 'allowed_signers') }]);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ checkedAt: NOW, version: '0.2.12' });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(await directNewest({ dataDir: home, build, now: () => NOW + 1000, list })).toEqual({ version: '0.2.12' });
    expect(asked).toHaveLength(1);
    const stop = startUpdateWatch({ version: build.version, home, env: {}, schedule: () => () => {}, newest: () => directNewest({ dataDir: home, build, now: () => NOW, list }) });
    for (let i = 0; i < 50 && currentBanner() === null; i++) await new Promise((r) => setTimeout(r, 10));
    stop();
    expect(currentBanner()).toMatchObject({ running: '0.2.11', available: '0.2.12' });
  });

  it('4: WHEN a data folder holds `direct-release-check.json` and `logout(dir)` runs THEN it is gone and `keep.txt` (text `mine`) is unchanged', async () => {
    const dir = path.join(home, 'data');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, DIRECT_CHECK_FILE), '{}');
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine');
    await logout(dir);
    expect([fs.existsSync(path.join(dir, DIRECT_CHECK_FILE)), fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')]).toEqual([false, 'mine']);
  });

  it('5: WHEN the save did not hold, or update-helper is missing, a folder or a symlink, or the download does not verify THEN the direct hand-off returns code 1 with its fixed line, downloads nothing in the first two cases and starts nothing in all of them', async () => {
    const calls: Call[] = [];
    const seen: unknown[] = [];
    const dl = okDownload(Buffer.from('tgz'), seen);
    expect(await startHandOff({ kind: 'direct', saved: false, home, env: {}, run: fakeSpawn(calls) })).toEqual({ code: 1, line: NOT_SAVED });
    const helper = path.join(app, 'update-helper');
    fs.rmSync(helper);
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), run: fakeSpawn(calls), download: dl })).toEqual({ code: 1, line: NO_HELPER });
    fs.mkdirSync(helper);
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), run: fakeSpawn(calls), download: dl })).toEqual({ code: 1, line: NO_HELPER });
    fs.rmdirSync(helper);
    fs.writeFileSync(path.join(home, 'h'), '#!/bin/sh\n', { mode: 0o700 });
    fs.symlinkSync(path.join(home, 'h'), helper);
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), run: fakeSpawn(calls), download: dl })).toEqual({ code: 1, line: NO_HELPER });
    expect(seen).toEqual([]);
    fs.rmSync(helper);
    fs.writeFileSync(helper, '#!/bin/sh\n', { mode: 0o700 });
    const lines: string[] = [];
    const bad = async () => ({ ok: false as const, reason: 'The release does not match its signed hash.' });
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), log: (l) => lines.push(l), run: fakeSpawn(calls), download: bad })).toEqual({ code: 1, line: FAILED });
    expect([lines, calls]).toEqual([[DOWNLOADING], []]);
  });

  it('6: WHEN the download verified THEN it ran with the installed version and keys, and update-helper is started once with argv `--from-stdin` only, stdio pipe/inherit/inherit, no shell, detached, the env without NODE_OPTIONS, and gets exactly `<sha256> 0.2.12` then the bytes on stdin (code 0); a stdin write error returns code 1 with the fixed line', async () => {
    const bytes = Buffer.from('verified tarball bytes');
    const calls: Call[] = [];
    const seen: unknown[] = [];
    // the startHandOff path end to end: a real ssh-keygen key in the installed allowed_signers, a stubbed fetch (no socket)
    serveSignedRelease('0.2.12', bytes);
    const argv1 = process.argv[1];
    process.argv[1] = entry();
    const r = await startHandOff({ kind: 'direct', saved: true, home, env: { HOME: home, NODE_OPTIONS: '--require /x.js' }, run: fakeSpawn(calls) }).finally(() => (process.argv[1] = argv1));
    expect([r, calls.map((c) => c.opts.env)]).toEqual([{ code: 0, line: '' }, [{ HOME: home }]]);
    calls.length = 0;
    const ok = await startDirectHandOff({ home, env: { HOME: home }, entry: entry(), run: fakeSpawn(calls), download: okDownload(bytes, seen) });
    expect(ok).toEqual({ code: 0, line: '' });
    expect(seen).toEqual([{ runningVersion: '0.2.11', allowedSignersPath: path.join(fs.realpathSync(app), 'allowed_signers') }]);
    expect(calls.map((c) => [c.cmd, c.args, c.opts])).toEqual([[path.join(fs.realpathSync(app), 'update-helper'), ['--from-stdin'], { stdio: ['pipe', 'inherit', 'inherit'], env: { HOME: home }, detached: true }]]);
    expect(Buffer.concat(calls[0].stdin).equals(Buffer.concat([Buffer.from(`${sha(bytes)} 0.2.12\n`), bytes]))).toBe(true);
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), run: fakeSpawn(calls, true), download: okDownload(bytes) })).toEqual({ code: 1, line: FAILED });
  });

  it('7: WHEN the real update helper (packaging/direct/install) gets the hand-off of a verified 0.2.12 tarball THEN 0.2.12 is the installed build and 0.2.11 is kept as app.prev, and the logging curl stub first on PATH is never run', async () => {
    const helper = path.join(app, 'update-helper');
    fs.copyFileSync(path.join(process.cwd(), 'packaging', 'direct', 'install'), helper);
    fs.chmodSync(helper, 0o700);
    const rel = fs.mkdtempSync(path.join(home, 'rel-'));
    fs.writeFileSync(path.join(rel, 'cli.js'), "console.log('snote 0.2.12');\n");
    fs.writeFileSync(path.join(rel, 'VERSION'), '0.2.12\n');
    fs.writeFileSync(path.join(rel, 'update-helper'), '#!/bin/sh\nexit 0\n');
    const tgz = path.join(home, 'r.tgz');
    expect(spawnSync('tar', ['-C', rel, '--owner=0', '--group=0', '--numeric-owner', '-czf', tgz, 'cli.js', 'VERSION', 'update-helper']).status).toBe(0);
    // a curl stub first on PATH (as test/packaging/direct-update-helper.test.ts) logs any call and fails, and the base is a
    // loopback port with nothing on it: if the helper ever took the download path here, it is seen and never reaches out
    const wrap = fs.mkdtempSync(path.join(home, 'wrap-'));
    const curlLog = path.join(wrap, 'curl.log');
    fs.writeFileSync(path.join(wrap, 'curl'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$CURLLOG"\nexit 1\n', { mode: 0o755 });
    const env = { PATH: `${wrap}:/usr/bin:/bin`, HOME: home, SNOTE_NODE: process.execPath, CURLLOG: curlLog, SNOTE_INSTALL_BASE: 'http://127.0.0.1:9' };
    let helperExit: Promise<number | null> = Promise.resolve(null);
    const run = ((cmd: string, args: string[], opts: object) => {
      const child = spawn(cmd, args, opts);
      helperExit = new Promise((done) => child.once('exit', done));
      return child;
    }) as typeof spawn;
    expect(await startDirectHandOff({ home, env, entry: entry(), run, download: okDownload(fs.readFileSync(tgz)) })).toEqual({ code: 0, line: '' });
    const code = await helperExit;
    const version = (d: string): string | null => {
      const f = path.join(home, '.local', 'share', 'snote-app', d, 'VERSION');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
    };
    expect({ code, curlRan: fs.existsSync(curlLog), app: version('app'), prev: version('app.prev') }).toEqual({ code: 0, curlRan: false, app: '0.2.12', prev: '0.2.11' });
  }, 20000);

  it('8: WHEN startHandOff hands a verified download to update-helper with no spawn passed in THEN it logs the status line, node\'s own spawn starts the helper in its own session and process group (not snote\'s, so the terminal closing as snote quits does not hang it up), the helper gets `<sha256> 0.2.12` then the bytes, the child is unref\'d once, and a helper that cannot start (mode 0600) gives code 1 with the fixed line', async () => {
    const bytes = Buffer.from('verified tarball bytes');
    serveSignedRelease('0.2.12', bytes);
    const helper = path.join(app, 'update-helper');
    const got = path.join(home, 'got');
    fs.writeFileSync(helper, `#!/bin/sh\ncat > '${got}.part'\ncat /proc/$$/stat > '${got}.stat'\nmv '${got}.part' '${got}'\n`, { mode: 0o700 });
    const lines: string[] = [];
    const argv1 = process.argv[1];
    process.argv[1] = entry();
    const r = await startHandOff({ kind: 'direct', saved: true, home, env: { HOME: home, PATH: '/usr/bin:/bin' }, log: (l) => lines.push(l) }).finally(() => (process.argv[1] = argv1));
    for (let i = 0; i < 200 && !fs.existsSync(got); i++) await new Promise((done) => setTimeout(done, 10));
    const stat = fs.existsSync(`${got}.stat`) ? fs.readFileSync(`${got}.stat`, 'utf8') : '0 (x) S 0 0 0';
    const child = { pid: Number(stat.split(' ')[0]), ...groupOf(stat) };
    const snote = groupOf(fs.readFileSync('/proc/self/stat', 'utf8'));
    const stdin = fs.existsSync(got) && fs.readFileSync(got).equals(Buffer.concat([Buffer.from(`${sha(bytes)} 0.2.12\n`), bytes]));
    expect({ r, lines, ownSession: child.sid === child.pid && child.pgrp === child.pid, notSnotes: child.pgrp !== snote.pgrp && child.sid !== snote.sid, stdin }).toEqual({ r: { code: 0, line: '' }, lines: [DOWNLOADING], ownSession: true, notSnotes: true, stdin: true });
    const calls: Call[] = [];
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), run: fakeSpawn(calls), download: okDownload(bytes) })).toEqual({ code: 0, line: '' });
    expect(calls.map((c) => c.unrefs)).toEqual([1]);
    fs.chmodSync(helper, 0o600);
    expect(await startDirectHandOff({ home, env: {}, entry: entry(), run: spawn, download: okDownload(bytes) })).toEqual({ code: 1, line: FAILED });
  });

  it('9: WHEN startDirectWatch starts the watch for a direct build (the entry in `~/.local/share/snote-app/app`, VERSION `0.2.11`) and the signed list says `0.2.12` THEN the watch runs with that VERSION and the home, the banner shows `0.2.11` -> `0.2.12` and the answer is saved in the data folder, not the home; a signed `0.2.11` (not newer) is saved too and shows no banner; with no VERSION no watch starts; and src/cli/main.tsx starts it for the direct kind, before the clone\'s watch', async () => {
    const seen: Array<{ version: string; home: string }> = [];
    const stops: Array<() => void> = [];
    const watch = ((o: Parameters<typeof startUpdateWatch>[0]) => (seen.push({ version: o.version, home: o.home }), stops.push(startUpdateWatch({ ...o, schedule: () => () => {} })), () => {})) as typeof startUpdateWatch;
    const saved = (d: string): unknown => (fs.existsSync(path.join(d, DIRECT_CHECK_FILE)) ? JSON.parse(fs.readFileSync(path.join(d, DIRECT_CHECK_FILE), 'utf8')).version : null);
    const data = path.join(home, 'data');
    const data2 = path.join(home, 'data2');
    fs.mkdirSync(data);
    fs.mkdirSync(data2);
    const argv1 = process.argv[1];
    process.argv[1] = entry();
    try {
      serveSignedRelease('0.2.12', Buffer.from('t'));
      startDirectWatch(data, home, watch);
      for (let i = 0; i < 200 && (currentBanner() === null || saved(data) === null); i++) await new Promise((done) => setTimeout(done, 10));
      const banner = currentBanner();
      expect({ seen, banner: banner && { running: banner.running, available: banner.available }, data: saved(data), home: saved(home) }).toEqual({ seen: [{ version: '0.2.11', home }], banner: { running: '0.2.11', available: '0.2.12' }, data: '0.2.12', home: null });
      resetBanner();
      serveSignedRelease('0.2.11', Buffer.from('t'));
      startDirectWatch(data2, home, watch);
      for (let i = 0; i < 200 && saved(data2) === null; i++) await new Promise((done) => setTimeout(done, 10));
      expect({ data2: saved(data2), banner: currentBanner() }).toEqual({ data2: '0.2.11', banner: null });
      fs.rmSync(path.join(app, 'VERSION'));
      seen.length = 0;
      startDirectWatch(data, home, watch);
      expect(seen).toEqual([]);
    } finally {
      process.argv[1] = argv1;
      for (const stop of stops) stop();
    }
    const main = fs.readFileSync('src/cli/main.tsx', 'utf8');
    const kind = main.indexOf('const kind = runningInstallKind();');
    const direct = main.indexOf("if (kind === 'direct') return (await import('../core/direct-download')).startDirectWatch(dataDir, os.homedir(), startUpdateWatch);");
    const clone = main.indexOf('startUpdateWatch({ version: VERSION, home: os.homedir(), env: process.env, stateDir, run: homepageGuard() });');
    expect({ kind: kind > 0, direct: direct > kind, clone: clone > direct }).toEqual({ kind: true, direct: true, clone: true });
  });

  it('10: WHEN the signed list answers a version that is not plain digits THEN the release check gives no version and saves nothing; WHEN the answer cannot be saved THEN the verified version is still given; and WHEN `~/.local/share` is a symlink THEN installedBuild finds the build at its real path', async () => {
    const build = installedBuild(entry(), home)!;
    const odd = await directNewest({ dataDir: home, build, now: () => NOW, list: async () => ({ version: '0.2.12; rm -rf ~' }) });
    fs.writeFileSync(path.join(home, 'plain'), '');
    const unsaved = await directNewest({ dataDir: path.join(home, 'plain'), build, now: () => NOW, list: async () => ({ version: '0.2.12' }) });
    const linked = fs.mkdtempSync(path.join(home, 'linked-'));
    fs.mkdirSync(path.join(linked, '.local'));
    fs.symlinkSync(path.join(home, '.local', 'share'), path.join(linked, '.local', 'share'));
    const viaLink = installedBuild(path.join(linked, '.local', 'share', 'snote-app', 'app', 'cli.js'), linked);
    expect({ odd, saved: fs.existsSync(path.join(home, DIRECT_CHECK_FILE)), unsaved, viaLink }).toEqual({ odd: null, saved: false, unsaved: { version: '0.2.12' }, viaLink: { appDir: fs.realpathSync(app), version: '0.2.11' } });
  });
});
