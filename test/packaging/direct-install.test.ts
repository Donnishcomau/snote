/**
 * Issues #339 and #340, lane L1 of the 0.2.12 update chain (#556, slice 60a): packaging/direct/install, the direct installer.
 * It downloads ASSETS.SHA256SUMS and the tarball of the newest release, checks the tarball's SHA-256, lists then unpacks it into a stage, and
 * swaps it in under ~/.local/share/snote-app with a shim at ~/.local/bin/snote. The fixture release (a flat tarball, owner 0/0, mtime 0, and
 * the strict three-line ASSETS.SHA256SUMS) is built here with tar and served by a loopback server through the SNOTE_INSTALL_BASE test seam.
 * Runner: Linux only (flock, GNU tar listing). No network beyond 127.0.0.1.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = process.cwd();
const installer = join(root, 'packaging', 'direct', 'install');
const work = mkdtempSync(join(tmpdir(), 'direct-install-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const VER = '0.2.9';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const TGZ = `snote-${VER}.tar.gz`;
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const put = (file: string, text: string, mode?: number): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, mode === undefined ? undefined : { mode });
};
const sh = (cmd: string, args: string[], cwd = work) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });

/** The fixture release: sums text and tarball bytes, in the asset form of the release (flat tarball, strict three-line list). */
let sums = '';
let tarball: Buffer = Buffer.alloc(0);
const FAKE_CLI = `console.log('snote ${VER}');\n`;
const PAYLOAD = ['SHA256SUMS', 'VERSION', 'allowed_signers', 'chunks/a-1.js', 'cli.js', 'update-helper'];
function buildRelease(): void {
  const dist = mkdtempSync(join(work, 'rel-'));
  put(join(dist, 'cli.js'), FAKE_CLI, 0o644);
  put(join(dist, 'VERSION'), VER + '\n', 0o644);
  put(join(dist, 'allowed_signers'), '# no keys in the fixture\n', 0o644);
  put(join(dist, 'update-helper'), '#!/bin/sh\nexit 0\n', 0o755);
  put(join(dist, 'chunks', 'a-1.js'), 'chunk\n', 0o644);
  put(join(dist, 'SHA256SUMS'), 'plugin-dist own manifest\n', 0o644);
  const out = join(mkdtempSync(join(work, 'rel-out-')), TGZ);
  const listFile = join(dirname(out), 'list');
  writeFileSync(listFile, PAYLOAD.join('\n') + '\n');
  const r = sh('tar', ['-C', dist, '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--no-recursion', '-T', listFile, '-czf', out]);
  expect(r.status).toBe(0);
  tarball = readFileSync(out);
  // the installer itself is the release's snote-install; when it is missing the tests below fail on their own assertions
  const self = existsSync(installer) ? readFileSync(installer) : Buffer.from('#!/usr/bin/env bash\n# installer missing\n');
  sums = `snote-assets ${VER} ${COMMIT}\n${sha(tarball)}  ${TGZ}\n${sha(self)}  snote-install\n`;
}

/** The loopback release server. `mode` picks the misbehaviour; `served` records what was asked for. */
interface Mode {
  sums?: string | Buffer;
  tarball?: Buffer;
  tarballFault?: 'truncate' | 'stall' | 'redirect-other-host';
  sumsFault?: 'redirect-other-host';
}
let mode: Mode = {};
const served: string[] = [];
let stalled: (() => void) | undefined;
let server: Server;
let port = 0;
beforeAll(async () => {
  buildRelease();
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '';
    served.push(url);
    if (url === '/latest/download/ASSETS.SHA256SUMS') {
      if (mode.sumsFault === 'redirect-other-host') {
        res.writeHead(302, { location: `http://localhost:${port}/elsewhere/ASSETS.SHA256SUMS` }).end();
        return;
      }
      res.writeHead(302, { location: `/download/v${VER}/ASSETS.SHA256SUMS` }).end();
    } else if (url === `/download/v${VER}/ASSETS.SHA256SUMS` || url === '/elsewhere/ASSETS.SHA256SUMS') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(mode.sums ?? sums);
    } else if (url === `/download/v${VER}/${TGZ}`) {
      const body = mode.tarball ?? tarball;
      if (mode.tarballFault === 'redirect-other-host') {
        res.writeHead(302, { location: `http://localhost:${port}/elsewhere/${TGZ}` }).end();
      } else if (mode.tarballFault === 'truncate' || mode.tarballFault === 'stall') {
        res.writeHead(200, { 'content-length': String(body.length) });
        res.write(body.subarray(0, Math.floor(body.length / 2)));
        if (mode.tarballFault === 'truncate') setTimeout(() => req.socket.destroy(), 50);
        else stalled?.();
      } else res.writeHead(200, { 'content-length': String(body.length) }).end(body);
    } else if (url === `/elsewhere/${TGZ}`) {
      res.writeHead(200).end(tarball);
    } else res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as AddressInfo).port;
}, 60000);
afterAll(() => {
  server?.closeAllConnections();
  server?.close();
});

interface Home {
  home: string;
  tmp: string;
  bin: string;
  shim: string;
  appRoot: string;
}
let homes = 0;
function makeHome(): Home {
  const home = join(work, `home-${homes++}`);
  const tmp = join(work, `tmp-${homes}`);
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  // the data folder holds a note cache the installer must never touch
  put(join(home, '.local', 'share', 'snote', 'notes.json'), '{"notes":["kept"]}\n');
  return { home, tmp, bin: join(home, '.local', 'bin'), shim: join(home, '.local', 'bin', 'snote'), appRoot: join(home, '.local', 'share', 'snote-app') };
}
const envFor = (h: Home, extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: h.home, TMPDIR: h.tmp, SNOTE_NODE: process.execPath, SNOTE_INSTALL_BASE: `http://127.0.0.1:${port}`, ...extra,
});
/** Run the installer to completion. */
function install(h: Home, extra: Record<string, string> = {}): Promise<{ status: number | null; signal: string | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const c = spawn('bash', [installer], { cwd: h.home, env: envFor(h, extra), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('close', (status, signal) => done({ status, signal, stdout, stderr }));
  });
}
/** Every path under dir with its type, mode and content hash: a change anywhere shows up. */
function snapshot(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const rel = p.slice(base.length);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) out.push(`d ${rel} ${(st.mode & 0o777).toString(8)}`, ...snapshot(p, base));
    else out.push(`f ${rel} ${(st.mode & 0o777).toString(8)} ${sha(readFileSync(p))}`);
  }
  return out;
}
const notInstalled = (h: Home): void => {
  expect(existsSync(join(h.appRoot, 'app'))).toBe(false);
  expect(existsSync(h.shim)).toBe(false);
};
/** The app folder holds no stage or download leftover. */
const noScratch = (h: Home): void => {
  expect(existsSync(h.appRoot) ? readdirSync(h.appRoot).filter((n) => /^app\.[A-Za-z0-9]{6}$/.test(n)) : []).toEqual([]);
  expect(readdirSync(h.tmp)).toEqual([]);
};
const dataFolder = (h: Home): string[] => snapshot(join(h.home, '.local', 'share', 'snote'));

/** A tarball with the fixture payload plus `more`, with the sums text that matches it. */
function hostile(make: (dir: string, list: string[]) => void): { sums: string; tarball: Buffer } {
  const dir = mkdtempSync(join(work, 'hostile-'));
  const out = join(mkdtempSync(join(work, 'hostile-out-')), TGZ);
  const base = join(mkdtempSync(join(work, 'hostile-base-')), 'orig.tgz');
  writeFileSync(base, tarball);
  expect(sh('tar', ['-xzf', base, '-C', dir]).status).toBe(0);
  const list = [...PAYLOAD];
  make(dir, list);
  const listFile = join(dirname(out), 'list');
  writeFileSync(listFile, list.join('\0') + '\0');
  const r = spawnSync('tar', ['-C', dir, '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--no-recursion', '-P', '--null', '-T', listFile, '-czf', out], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(r.status).toBe(0);
  const bytes = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  rmSync(dirname(out), { recursive: true, force: true });
  const lines = sums.split('\n');
  lines[1] = `${sha(bytes)}  ${TGZ}`;
  return { sums: lines.join('\n'), tarball: bytes };
}

describe('issues #339 and #340 (lane L1): the direct installer', () => {
  it('1: WHEN the installer runs against a fixture release on a home with no snote THEN snote is under `~/.local/share/snote-app/app` with a shim `~/.local/bin/snote` that holds the direct marker, the exit is `0`, the data folder `~/.local/share/snote` is byte-identical, nothing else appears in the home folder, nothing is written to the temp folder, and the app files have modes 0700 for folders and cli.js, 0600 for other files', async () => {
    mode = {};
    const h = makeHome();
    const dataBefore = dataFolder(h);
    chmodSync(h.tmp, 0o500);
    const r = await install(h);
    chmodSync(h.tmp, 0o700);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(existsSync(join(h.appRoot, 'app', 'cli.js'))).toBe(true);
    expect(readFileSync(join(h.appRoot, 'app', 'VERSION'), 'utf8')).toBe(VER + '\n');
    expect(readFileSync(join(h.appRoot, 'app', 'cli.js'), 'utf8')).toBe(FAKE_CLI);
    const shim = readFileSync(h.shim, 'utf8');
    expect(shim).toContain('# snote-direct-shim v1 (packaging/direct/install)');
    expect(statSync(h.shim).mode & 0o777).toBe(0o755);
    expect(dataFolder(h)).toEqual(dataBefore);
    const top = (d: string) => readdirSync(d).sort();
    expect(top(h.home)).toEqual(['.local']);
    expect(top(join(h.home, '.local'))).toEqual(['bin', 'share']);
    expect(top(join(h.home, '.local', 'share'))).toEqual(['snote', 'snote-app']);
    expect(top(h.bin)).toEqual(['snote']);
    expect(top(h.appRoot)).toEqual(['app', 'run.lock']);
    const mod = (rel: string) => (statSync(join(h.appRoot, 'app', rel)).mode & 0o777).toString(8);
    expect([mod('.'), mod('chunks'), mod('cli.js'), mod('update-helper'), mod('VERSION'), mod('chunks/a-1.js')]).toEqual(['700', '700', '700', '700', '600', '600']);
    noScratch(h);
    const ran = spawnSync(h.shim, ['--version'], { env: envFor(h), encoding: 'utf8', timeout: 10000 });
    expect(ran.stdout).toBe(`snote ${VER}\n`);
    expect(served[0]).toBe('/latest/download/ASSETS.SHA256SUMS');
  }, 30000);

  it('2: WHEN the tarball sha256 does not match, or the list names another file, or the connection closes partway, or the list or the tarball is over its size cap, or the run is interrupted during the download THEN it exits non-zero saying `checksum mismatch` or `download failed`, installs nothing, leaves an existing install byte for byte as it was, and removes its stage', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const before = snapshot(h.home);
    const refused = async (m: Mode, text: string): Promise<void> => {
      mode = m;
      const r = await install(h);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain(text);
      expect(snapshot(h.home)).toEqual(before);
      noScratch(h);
    };
    await refused({ tarball: Buffer.concat([tarball, Buffer.from('x')]) }, 'checksum mismatch');
    await refused({ sums: sums.replace(` ${TGZ}`, ' snote-0.0.1.tar.gz') }, 'checksum mismatch');
    await refused({ tarballFault: 'truncate' }, 'download failed');
    await refused({ sums: 'x'.repeat(5000) + '\n' }, 'download failed'); // over the 4 KiB cap
    await refused({ tarball: Buffer.alloc(9 * 1024 * 1024) }, 'download failed'); // over the 8 MiB cap
    // interrupted: the server holds the connection open after half the tarball; SIGINT to the installer
    mode = { tarballFault: 'stall' };
    const waiting = new Promise<void>((ok) => (stalled = ok));
    const fresh = makeHome();
    const c: ChildProcess = spawn('bash', [installer], { cwd: fresh.home, env: envFor(fresh), stdio: 'ignore' });
    const closed = new Promise<{ code: number | null; signal: string | null }>((ok) => c.on('close', (code, signal) => ok({ code, signal })));
    await waiting;
    c.kill('SIGINT');
    const end = await closed;
    expect(end.code === 130 || end.signal === 'SIGINT').toBe(true);
    notInstalled(fresh);
    noScratch(fresh);
    mode = {};
  }, 60000);

  it('3: WHEN it runs a second time THEN it exits `0` with one shim and the data folder unchanged, the first build kept as app.prev', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const dataBefore = dataFolder(h);
    const r = await install(h);
    expect(r.status).toBe(0);
    expect(readdirSync(h.bin)).toEqual(['snote']);
    expect(dataFolder(h)).toEqual(dataBefore);
    expect(readdirSync(h.appRoot).sort()).toEqual(['app', 'app.prev', 'run.lock']);
    expect(readFileSync(join(h.appRoot, 'app', 'VERSION'), 'utf8')).toBe(VER + '\n');
    expect(readFileSync(join(h.appRoot, 'app.prev', 'VERSION'), 'utf8')).toBe(VER + '\n');
    noScratch(h);
  }, 30000);

  it('4: WHEN `~/.local/bin/snote` exists and is the plugin shim, any file without the direct-install marker, or a symlink, or `snote-app`, `app` or `app.prev` is a symlink THEN it refuses with `snote is already installed by the plugin: remove it first` or `symlink` and changes nothing', async () => {
    mode = {};
    const plugin = '#!/bin/sh\n# snote-omarchy-shim v1 (packaging/omarchy/setup) — safe to remove\nexec node /somewhere/cli.js "$@"\n';
    const cases: Array<[string, (h: Home) => void, string]> = [
      ['plugin shim', (h) => put(h.shim, plugin, 0o755), 'snote is already installed by the plugin: remove it first'],
      ['unrelated file', (h) => put(h.shim, 'not a shim\n'), 'snote is already installed by the plugin: remove it first'],
      ['symlinked shim', (h) => (mkdirSync(h.bin, { recursive: true }), symlinkSync('/usr/bin/true', h.shim)), 'snote is already installed by the plugin: remove it first'],
      ['symlinked snote-app', (h) => (mkdirSync(dirname(h.appRoot), { recursive: true }), symlinkSync(h.tmp, h.appRoot)), 'symlink'],
      ['symlinked app', (h) => (mkdirSync(h.appRoot, { recursive: true }), symlinkSync(h.tmp, join(h.appRoot, 'app'))), 'symlink'],
      ['symlinked app.prev', (h) => (mkdirSync(h.appRoot, { recursive: true }), symlinkSync(h.tmp, join(h.appRoot, 'app.prev'))), 'symlink'],
    ];
    for (const [label, arrange, text] of cases) {
      const h = makeHome();
      arrange(h);
      const before = snapshot(h.home);
      const r = await install(h);
      expect(r.status, label).not.toBe(0);
      expect(r.stderr).toContain(text);
      expect(snapshot(h.home)).toEqual(before);
      expect(readdirSync(h.tmp)).toEqual([]);
    }
  }, 60000);

  it('5: WHEN the tarball holds an absolute path, a `..` segment, a symlink, a hardlink, a fifo, a backslash or control character in a name, more than 2000 entries, more than 64 MiB, or a VERSION other than the list version THEN it installs nothing', async () => {
    const cases: Array<[string, (dir: string, list: string[]) => void, string]> = [
      ['absolute', (dir, list) => (put(join(dir, 'abs.js'), 'x\n'), list.push(join(dir, 'abs.js'))), 'absolute path'],
      ['dot dot', (dir, list) => (put(join(dir, 'sub', 'x.js'), 'x\n'), list.push('sub/../sub/x.js')), "'..' path"],
      ['symlink', (dir, list) => (symlinkSync('cli.js', join(dir, 'link.js')), list.push('link.js')), 'not a plain file or folder'],
      ['hardlink', (dir, list) => (linkSync(join(dir, 'cli.js'), join(dir, 'hard.js')), list.push('hard.js')), 'not a plain file or folder'],
      ['fifo', (dir, list) => (expect(sh('mkfifo', [join(dir, 'pipe.js')]).status).toBe(0), list.push('pipe.js')), 'not a plain file or folder'],
      ['backslash', (dir, list) => (put(join(dir, 'back\\slash.js'), 'x\n'), list.push('back\\slash.js')), 'control character or a backslash'],
      ['newline', (dir, list) => (put(join(dir, 'new\nline.js'), 'x\n'), list.push('new\nline.js')), 'control character or a backslash'],
      ['another version', (dir) => put(join(dir, 'VERSION'), '0.0.1\n'), 'another version'],
      ['too many entries', (dir, list) => {
        for (let i = 0; i < 2001; i++) {
          put(join(dir, 'many', `f${i}`), '');
          list.push(`many/f${i}`);
        }
      }, 'too large'],
      ['too large', (dir, list) => {
        writeFileSync(join(dir, 'big.bin'), '');
        truncateSync(join(dir, 'big.bin'), 65 * 1024 * 1024); // a sparse file: no disk is used
        list.push('big.bin');
      }, 'too large'],
    ];
    for (const [label, make, text] of cases) {
      const evil = hostile(make);
      mode = { sums: evil.sums, tarball: evil.tarball };
      const h = makeHome();
      const before = dataFolder(h);
      const r = await install(h);
      expect(r.status, label).not.toBe(0);
      expect(r.stderr, label).toContain(text);
      expect(r.stderr, label).toContain('nothing was installed');
      expect(dataFolder(h), label).toEqual(before);
      notInstalled(h);
      noScratch(h);
    }
    mode = {};
  }, 120000);

  it('6: WHEN `id -u` prints `0`, or `SNOTE_INSTALL_BASE` is not the default or `http://127.0.0.1:<port>`, or the download is redirected to another host, or `HOME` is not an absolute folder, or a snote holds `run.lock`, THEN it refuses with a plain sentence, writes nothing, and the script holds the A3 curl flags, no `sudo`, `su` or `pkexec`, no `-k` or `--insecure`, no `sha256sum -c` and no other host', async () => {
    mode = {};
    // root: a PATH-shimmed id
    const shimDir = mkdtempSync(join(work, 'fakeid-'));
    put(join(shimDir, 'id'), '#!/bin/sh\necho 0\n', 0o755);
    chmodSync(join(shimDir, 'id'), 0o755);
    const root0 = makeHome();
    const asRoot = await install(root0, { PATH: `${shimDir}:${process.env.PATH ?? ''}` });
    expect(asRoot.status).not.toBe(0);
    expect(asRoot.stderr).toContain('do not run this as root');
    expect(existsSync(join(root0.home, '.local', 'bin'))).toBe(false);
    expect(existsSync(root0.appRoot)).toBe(false);
    const rel = makeHome();
    const relHome = await install(rel, { HOME: '.' }); // a relative HOME that exists (the working folder is the temp home)
    expect(relHome.status).not.toBe(0);
    expect(relHome.stderr).toContain('HOME must be an absolute folder you own');
    expect(existsSync(rel.appRoot)).toBe(false);
    // the seam accepts only the default or a loopback address
    for (const bad of ['http://example.com', 'http://127.0.0.1.evil.example:1', 'https://127.0.0.1:1', 'http://localhost:1', 'http://127.0.0.1:1/x']) {
      const h = makeHome();
      const r = await install(h, { SNOTE_INSTALL_BASE: bad });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('SNOTE_INSTALL_BASE is not allowed');
      expect(existsSync(h.appRoot)).toBe(false);
    }
    // a redirect to a host that is not GitHub (here localhost against the 127.0.0.1 seam), for the list and for the tarball
    for (const m of [{ sumsFault: 'redirect-other-host' }, { tarballFault: 'redirect-other-host' }] as Mode[]) {
      mode = m;
      const h = makeHome();
      const r = await install(h);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('download refused: unexpected host');
      notInstalled(h);
      noScratch(h);
    }
    mode = {};
    // a running snote: a shared lock on run.lock
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const before = snapshot(h.home);
    // the holder's child runs until its input closes, so no process outlives the test and the lock is free once both have exited
    const holder = spawn('flock', ['-s', join(h.appRoot, 'run.lock'), 'sh', '-c', 'echo $$; exec cat >/dev/null'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const released = new Promise<void>((ok) => holder.on('close', () => ok()));
    const child = await new Promise<number>((ok) => holder.stdout?.once('data', (d) => ok(Number(String(d).trim())))); // the lock is held once the child prints its pid
    const busy = await install(h);
    holder.stdin?.end();
    await released;
    expect(() => process.kill(child, 0)).toThrow(); // the child under flock has exited too
    expect(busy.status).not.toBe(0);
    expect(busy.stderr).toContain('snote is running: quit it and run the installer again');
    expect(snapshot(h.home)).toEqual(before);
    expect((await install(h)).status).toBe(0); // the lock went with the holder: nothing else holds it
    // the script text
    const code = readFileSync(installer, 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(code).toContain("--proto '=https' --proto-redir '=https'");
    for (const flag of ['--tlsv1.2', '-fsSL', '--max-redirs 3', '--max-time 120', '--max-filesize', "-w '%{url_effective}'"]) expect(code).toContain(flag);
    expect(code).not.toMatch(/(^|[\s;&|(])(sudo|su|pkexec)([\s;&|)]|$)/m);
    expect(code).not.toMatch(/(^|\s)(-k|--insecure|--proxy\S*)(\s|$)/m);
    expect(code).not.toMatch(/\|\s*(ba|z|da)?sh\b/);
    expect(code).not.toContain('sha256sum -c');
    expect(code).not.toContain('raw.githubusercontent.com');
    expect(code).not.toContain('api.github.com');
    expect(code).toContain('BASE_DEFAULT="https://github.com/Donnishcomau/snote/releases"');
    expect(code).toContain('case "$host" in github.com|release-assets.githubusercontent.com|objects.githubusercontent.com) ;; *) fail "download refused: unexpected host $host" ;; esac');
  }, 90000);

  it('7: WHEN the new build does not start THEN an update exits non-zero with `update failed: the new build did not start, so the old one was kept` and leaves the home byte for byte as it was (the kept build back in app, the shim unchanged, no stage), and a first install exits non-zero with `install failed: the new build did not start, so nothing was installed` and installs nothing', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const before = snapshot(h.home);
    const broken = hostile((dir) => put(join(dir, 'cli.js'), 'process.exit(3);\n'));
    mode = { sums: broken.sums, tarball: broken.tarball };
    const update = await install(h);
    expect(update.status).not.toBe(0);
    expect(update.stderr).toContain('update failed: the new build did not start, so the old one was kept');
    expect(snapshot(h.home)).toEqual(before);
    noScratch(h);
    const fresh = makeHome();
    const first = await install(fresh);
    expect(first.status).not.toBe(0);
    expect(first.stderr).toContain('install failed: the new build did not start, so nothing was installed');
    notInstalled(fresh);
    noScratch(fresh);
    mode = {};
  }, 60000);

  it('8: WHEN snote runs through the shim THEN the installer refuses with `snote is running: quit it and run the installer again` until snote quits and installs after, and WHEN app is missing and app.prev holds a build THEN the shim runs the kept build', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    // a snote that runs until its input closes
    writeFileSync(join(h.appRoot, 'app', 'cli.js'), "process.stdout.write('running\\n'); process.stdin.resume(); process.stdin.on('end', () => process.exit(0));\n");
    const app = spawn(h.shim, [], { env: envFor(h), stdio: ['pipe', 'pipe', 'ignore'] });
    const quit = new Promise<number | null>((ok) => app.on('close', (code) => ok(code)));
    await new Promise<void>((ok) => app.stdout?.once('data', () => ok())); // snote is running once it prints
    const busy = await install(h);
    app.stdin?.end();
    expect(await quit).toBe(0);
    expect(busy.status).not.toBe(0);
    expect(busy.stderr).toContain('snote is running: quit it and run the installer again');
    expect((await install(h)).status).toBe(0);
    // between the two renames of an update: no app/cli.js, the kept build in app.prev
    writeFileSync(join(h.appRoot, 'app.prev', 'cli.js'), "console.log('snote kept');\n");
    rmSync(join(h.appRoot, 'app'), { recursive: true, force: true });
    const ran = spawnSync(h.shim, ['--version'], { env: envFor(h), encoding: 'utf8', timeout: 10000 });
    expect(ran.stdout).toBe('snote kept\n');
  }, 60000);

  it('9: WHEN `~/.local/bin/snote` becomes a symlink after the first check (here the new build makes it during its start check) THEN it refuses with `is a symlink; refusing to use it`, leaves the symlink as it was and leaves no shim temp file in `~/.local/bin`', async () => {
    const h = makeHome();
    // the start check runs with a temp HOME, so the build names the real shim path
    const racing = hostile((dir) =>
      put(join(dir, 'cli.js'), `import('node:fs').then((fs) => { fs.symlinkSync('/usr/bin/true', ${JSON.stringify(h.shim)}); console.log('snote ${VER}'); });\n`),
    );
    mode = { sums: racing.sums, tarball: racing.tarball };
    const r = await install(h);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('is a symlink; refusing to use it');
    expect(readdirSync(h.bin)).toEqual(['snote']);
    expect(lstatSync(h.shim).isSymbolicLink()).toBe(true);
    noScratch(h);
    mode = {};
  }, 30000);

  it('10: WHEN the new build hangs in its start check THEN the check ends at its bound (here SNOTE_INSTALL_START_SECS=0.5), the hung build is gone, an update exits non-zero with `update failed: the new build did not start, so the old one was kept` and leaves the home byte for byte as it was', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const before = snapshot(h.home);
    const pidFile = join(work, `hung-${homes}.pid`);
    // it would print its version after 4 s: only the bound stops it from passing
    const hung = hostile((dir) =>
      put(join(dir, 'cli.js'), `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => console.log('snote ${VER}'), 4000);\n`),
    );
    mode = { sums: hung.sums, tarball: hung.tarball };
    const r = await install(h, { SNOTE_INSTALL_START_SECS: '0.5' });
    mode = {};
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('update failed: the new build did not start, so the old one was kept');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
    expect(snapshot(h.home)).toEqual(before);
    noScratch(h);
    expect(readFileSync(installer, 'utf8')).toContain('\nstart_secs=10\n'); // the bound without the seam
  }, 60000);

  it('11: WHEN the new build exits 0 but its stdout is not exactly `snote <ver>` (a warning only, the version on stderr only, an extra line, another version) THEN an update exits non-zero with `update failed: the new build did not start, so the old one was kept` and leaves the home byte for byte as it was', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const before = snapshot(h.home);
    const bodies = [
      "console.log('warning: something is off');\n",
      `console.error('snote ${VER}');\n`,
      `console.log('snote ${VER}'); console.log('extra');\n`,
      "console.log('snote 0.2.8');\n",
    ];
    for (const body of bodies) {
      const bad = hostile((dir) => put(join(dir, 'cli.js'), body));
      mode = { sums: bad.sums, tarball: bad.tarball };
      const r = await install(h);
      expect({ body, status: r.status === 0 }).toEqual({ body, status: false });
      expect(r.stderr).toContain('update failed: the new build did not start, so the old one was kept');
      expect(snapshot(h.home)).toEqual(before);
    }
    mode = {};
    noScratch(h);
  }, 90000);

  it('12: WHEN the start check runs THEN the build sees only PATH, a temp HOME and temp XDG_* folders inside the stage and SNOTE_UPDATE_CHECK=off, the real data folder stays byte-identical even when the build writes its HOME, the temp HOME is gone after, and a process the build leaves behind does not hold run.lock (the next install exits 0)', async () => {
    mode = {};
    const h = makeHome();
    const dataBefore = dataFolder(h);
    const rec = join(work, `probe-${homes}.json`);
    const probe = hostile((dir) =>
      put(
        join(dir, 'cli.js'),
        [
          "const fs = require('node:fs');",
          "const home = process.env.HOME || '/nonexistent';",
          "fs.mkdirSync(home + '/.local/share/snote', { recursive: true });",
          "fs.writeFileSync(home + '/.local/share/snote/notes.json', 'clobbered');",
          // the leftover keeps every descriptor the build was given, fd 9 included when it is open
          "let stdio = ['ignore', 'ignore', 'ignore'];",
          "try { fs.fstatSync(9); stdio = ['ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9]; } catch { /* fd 9 is closed */ }",
          "const left = require('node:child_process').spawn('/bin/sh', ['-c', 'exec sleep 20'], { detached: true, stdio });",
          'left.unref();',
          `fs.writeFileSync(${JSON.stringify(rec)}, JSON.stringify({ env: process.env, left: left.pid }));`,
          `console.log('snote ${VER}');`,
        ].join('\n') + '\n',
      ),
    );
    mode = { sums: probe.sums, tarball: probe.tarball };
    const left: number[] = [];
    try {
      const r = await install(h);
      expect(existsSync(rec)).toBe(true); // the start check ran the build
      const seen = JSON.parse(readFileSync(rec, 'utf8')) as { env: Record<string, string>; left: number };
      left.push(seen.left);
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(Object.keys(seen.env).sort()).toEqual(['HOME', 'PATH', 'SNOTE_UPDATE_CHECK', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']);
      expect(seen.env.PATH).toBe('/usr/bin:/bin');
      expect(seen.env.SNOTE_UPDATE_CHECK).toBe('off');
      expect(seen.env.HOME.startsWith(join(h.appRoot, 'app.'))).toBe(true);
      for (const k of ['XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) expect(seen.env[k].startsWith(join(h.appRoot, 'app.'))).toBe(true);
      expect(existsSync(seen.env.HOME)).toBe(false);
      expect(dataFolder(h)).toEqual(dataBefore);
      expect(() => process.kill(seen.left, 0)).not.toThrow(); // the leftover still runs
      const again = await install(h);
      left.push((JSON.parse(readFileSync(rec, 'utf8')) as { left: number }).left);
      expect(again.stderr).toBe('');
      expect(again.status).toBe(0);
      noScratch(h);
    } finally {
      mode = {};
      for (const p of left) {
        try {
          process.kill(p, 'SIGKILL');
        } catch {
          // already gone
        }
      }
    }
  }, 60000);

  /** Wait (polling every 25 ms, at most `ms`) until `ok()` holds; false when it never did. */
  async function until(ok: () => boolean, ms = 8000): Promise<boolean> {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 25))) if (ok()) return true;
    return ok();
  }
  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it('13: WHEN the installer gets SIGINT, or SIGTERM, while the new build blocks in its start check (an update after two installs, and a first install) THEN it exits non-zero, the blocked build is gone, the update leaves the home byte for byte as it was (app, app.prev and the shim) and the first install installs nothing (no app, no shim), the data folder is unchanged and no stage is left', async () => {
    mode = {};
    const upd = makeHome();
    expect((await install(upd)).status).toBe(0);
    expect((await install(upd)).status).toBe(0);
    for (const [h, signal] of [[upd, 'SIGINT'], [makeHome(), 'SIGTERM']] as const) {
      const before = snapshot(h.home);
      const pidFile = join(work, `blocked-${homes}-${signal}.pid`);
      // the build writes its pid and then never exits: only the signal (well inside the 10 s bound) ends the run
      const blocked = hostile((dir) => put(join(dir, 'cli.js'), `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);\n`));
      mode = { sums: blocked.sums, tarball: blocked.tarball };
      const c = spawn('bash', [installer], { cwd: h.home, env: envFor(h), stdio: ['ignore', 'pipe', 'pipe'] });
      const closed = new Promise<number | null>((ok) => c.on('close', (status) => ok(status)));
      expect(await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '')).toBe(true);
      const pid = Number(readFileSync(pidFile, 'utf8'));
      c.kill(signal);
      const status = await closed;
      mode = {};
      try {
        expect(status).not.toBe(0);
        expect(await until(() => !alive(pid))).toBe(true);
        if (h === upd) expect(snapshot(h.home)).toEqual(before);
        else notInstalled(h);
        expect(dataFolder(h)).toEqual(dataFolder(upd));
        noScratch(h);
      } finally {
        if (alive(pid)) process.kill(pid, 'SIGKILL');
      }
    }
  }, 60000);

  it('14: WHEN an update whose build does not start runs on a home installed twice (so app.prev holds the first build) THEN it exits non-zero with `update failed: the new build did not start, so the old one was kept` and app.prev, app and the shim are byte for byte as they were', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    expect((await install(h)).status).toBe(0);
    expect(existsSync(join(h.appRoot, 'app.prev', 'cli.js'))).toBe(true);
    const before = snapshot(h.home);
    const broken = hostile((dir) => put(join(dir, 'cli.js'), 'process.exit(3);\n'));
    mode = { sums: broken.sums, tarball: broken.tarball };
    const r = await install(h);
    mode = {};
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('update failed: the new build did not start, so the old one was kept');
    expect(snapshot(h.home)).toEqual(before);
    noScratch(h);
  }, 60000);

  it('15: WHEN the installer gets SIGINT, SIGTERM or SIGHUP after app became app.prev and before the shim is written (a copy of the installer that waits there; the shipped file is not edited) on an update after two installs THEN it exits 0, app is the new build, app.prev is byte for byte the old app and the shim runs', async () => {
    const anchor = '  mv_dir "$app_dir" "$prev_dir"\n';
    const src = readFileSync(installer, 'utf8');
    expect(src.split(anchor).length).toBe(2);
    // the copy marks the window and waits there until the test has sent the signal
    const paused = join(work, 'install-paused');
    writeFileSync(paused, src.replace(anchor, `${anchor}  : > "$HOME/in-window"; until [ -e "$HOME/go" ]; do sleep 0.05; done\n`), { mode: 0o700 });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      mode = {};
      const h = makeHome();
      expect((await install(h)).status).toBe(0);
      expect((await install(h)).status).toBe(0);
      const oldApp = snapshot(join(h.appRoot, 'app'));
      const next = hostile((dir) => put(join(dir, 'cli.js'), `console.log('snote ${VER}'); // the new build\n`));
      mode = { sums: next.sums, tarball: next.tarball };
      const c = spawn('bash', [paused], { cwd: h.home, env: envFor(h), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      c.stdout.on('data', (d) => (stdout += d));
      const closed = new Promise<number | null>((ok) => c.on('close', (status) => ok(status)));
      expect(await until(() => existsSync(join(h.home, 'in-window')))).toBe(true);
      c.kill(signal);
      writeFileSync(join(h.home, 'go'), '');
      const status = await closed;
      mode = {};
      rmSync(join(h.home, 'in-window'), { force: true });
      rmSync(join(h.home, 'go'), { force: true });
      expect({ signal, status }).toEqual({ signal, status: 0 });
      expect(stdout).toContain('is installed');
      expect(readFileSync(join(h.appRoot, 'app', 'cli.js'), 'utf8')).toContain('// the new build');
      expect(snapshot(join(h.appRoot, 'app.prev'))).toEqual(oldApp);
      const run = spawnSync('sh', [h.shim, '--version'], { cwd: h.home, env: envFor(h), encoding: 'utf8', timeout: 20000 });
      expect(run.stdout).toBe(`snote ${VER}\n`);
      noScratch(h);
    }
  }, 60000);

  it('16: WHEN the checksum list has a NUL byte, no final newline, no bytes, other than 3 lines (2, 4 with a repeated line, a blank 4th line), CRLF line ends, a line 1 version that is path-like or not 3 or 4 numbers or a commit that is not 40 lowercase hex, a line 2 hash that is not 64 lowercase hex or a path-like name or one space, or a line 3 that is not `<64 hex>  snote-install` (the tarball name repeated, `./snote-install`, a short hash) THEN it exits non-zero with `the checksum list is not valid (<the check>)`, and WHEN line 2 passes the parser but names `snote-install`, `..` or `.` THEN it exits non-zero with `checksum mismatch: the list names <name>, not snote-<ver>.tar.gz`; each time it never asks for the tarball, leaves the existing install byte for byte as it was and removes its stage, and the well-formed list still installs', async () => {
    mode = {};
    const h = makeHome();
    expect((await install(h)).status).toBe(0);
    const before = snapshot(h.home);
    const [l1, l2, l3] = sums.split('\n');
    const h2 = l2.slice(0, 64);
    const h3 = l3.slice(0, 64);
    const list = (a: string, b: string, c: string): string => `${a}\n${b}\n${c}\n`;
    const bad = (why: string): string => `the checksum list is not valid (${why})`;
    const cases: [string, string][] = [
      [`snote-assets\0 ${VER} ${COMMIT}\n${l2}\n${l3}\n`, bad('NUL byte')],
      [sums.slice(0, -1), bad('no final newline')],
      ['', bad('no final newline')],
      [`${l1}\n${l2}\n`, bad('not 3 lines')],
      [`${sums}${l3}\n`, bad('not 3 lines')],
      [`${sums}\n`, bad('not 3 lines')],
      [sums.replace(/\n/g, '\r\n'), bad('line 1')],
      [list(l1.replace(VER, '0.2/9'), l2, l3), bad('line 1')],
      [list(l1.replace(VER, '../0.2.9'), l2, l3), bad('line 1')],
      [list(l1.replace(VER, '0.2'), l2, l3), bad('line 1')],
      [list(l1.replace(VER, '0.2.9.1.1'), l2, l3), bad('line 1')],
      [list(l1.replace(COMMIT, COMMIT.slice(1)), l2, l3), bad('line 1')],
      [list(l1.replace(COMMIT, COMMIT.toUpperCase()), l2, l3), bad('line 1')],
      [list(l1, l2.slice(1), l3), bad('line 2')],
      [list(l1, `0${l2}`, l3), bad('line 2')],
      [list(l1, `${h2.toUpperCase()}  ${TGZ}`, l3), bad('line 2')],
      [list(l1, `${h2} ${TGZ}`, l3), bad('line 2')],
      [list(l1, `${h2}  ../${TGZ}`, l3), bad('line 2')],
      [list(l1, `${h2}  x/${TGZ}`, l3), bad('line 2')],
      [list(l1, `${h2}  /${TGZ}`, l3), bad('line 2')],
      [list(l1, l2, l3.slice(1)), bad('line 3')],
      [list(l1, l2, `${h3}  ${TGZ}`), bad('line 3')],
      [list(l1, l2, `${h3}  ./snote-install`), bad('line 3')],
      [list(l1, l2, `${l3} `), bad('line 3')],
      [list(l1, `${h2}  snote-install`, l3), `checksum mismatch: the list names snote-install, not ${TGZ}`],
      [list(l1, `${h2}  ..`, l3), `checksum mismatch: the list names .., not ${TGZ}`],
      [list(l1, `${h2}  .`, l3), `checksum mismatch: the list names ., not ${TGZ}`],
    ];
    for (const [text, why] of cases) {
      mode = { sums: text };
      const asked = served.length;
      const r = await install(h);
      mode = {};
      expect({ text, status: r.status === 0 ? 0 : 'non-zero', why: r.stderr.includes(why) }).toEqual({ text, status: 'non-zero', why: true });
      expect({ text, tarball: served.slice(asked).filter((u) => u.endsWith('.tar.gz')) }).toEqual({ text, tarball: [] });
      expect(snapshot(h.home)).toEqual(before);
      noScratch(h);
    }
    expect((await install(h)).status).toBe(0);
    noScratch(h);
  }, 60000);
});
