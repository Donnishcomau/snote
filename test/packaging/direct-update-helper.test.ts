/**
 * Issues #340, #342 and #343 (, 69f2), lane L5c of #30: packaging/direct/install run as the build's
 * update-helper with `--from-stdin`. snote writes one header line `<sha256> <version>` and then the tarball it verified on
 * the helper's stdin (a pipe, or the socket pair Node uses for a child's stdin). The helper downloads nothing, reads all of stdin before it waits for the run lock, hashes the
 * file it wrote before and after unpacking, and then runs the same list, unpack, scan, start check and swap as a download.
 * A `tar` wrapper first on PATH logs each tar mode (and can replace the work file at listing time), so a test sees the
 * unpacking itself, and a `curl` stub first on PATH logs any call and fails, so a download attempt is seen and never reaches
 * the network. Runner: Linux only (flock, GNU tar). No network.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildSplitDist } from '../helpers/bundle-size';

const installer = join(process.cwd(), 'packaging', 'direct', 'install');
const work = mkdtempSync(join(tmpdir(), 'direct-helper-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const put = (file: string, text: string, mode = 0o644): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, { mode });
};
const realTar = spawnSync('sh', ['-c', 'command -v tar'], { encoding: 'utf8' }).stdout.trim();

let n = 0;
/** A release tarball (flat, owner 0/0, mtime 0) for `ver`; `more` may add entries to the folder and the list. */
function release(ver: string, more?: (dir: string, list: string[]) => void): Buffer {
  const dir = join(work, `rel-${n++}`);
  put(join(dir, 'cli.js'), `console.log('snote ${ver}');\n`);
  put(join(dir, 'VERSION'), ver + '\n');
  put(join(dir, 'allowed_signers'), '# no keys in the fixture\n');
  put(join(dir, 'update-helper'), '#!/bin/sh\nexit 0\n', 0o755);
  const list = ['VERSION', 'allowed_signers', 'cli.js', 'update-helper'];
  more?.(dir, list);
  const out = `${dir}.tgz`;
  writeFileSync(`${dir}.list`, list.join('\n') + '\n');
  const r = spawnSync(realTar, ['-C', dir, '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--no-recursion', '-T', `${dir}.list`, '-czf', out]);
  expect(r.status).toBe(0);
  return readFileSync(out);
}

interface Home {
  home: string;
  appRoot: string;
  wrap: string;
  log: string;
  curlLog: string;
}
function makeHome(): Home {
  const home = join(work, `home-${n++}`);
  put(join(home, '.local', 'share', 'snote', 'notes.json'), '{"notes":["kept"]}\n');
  const wrap = join(work, `wrap-${n++}`);
  // the tar wrapper: logs the mode, and at listing time copies $SWAP over the work file when it is set
  put(join(wrap, 'tar'), `#!/bin/sh\nprintf '%s\\n' "$1" >> "$TARLOG"\nif [ "$1" = -tvzf ] && [ -n "$SWAP" ]; then cat "$SWAP" > "$2"; fi\nexec '${realTar}' "$@"\n`, 0o755);
  // the curl stub: shadows the real curl in /usr/bin, logs its arguments and fails, so no test can reach the network
  put(join(wrap, 'curl'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CURLLOG"\nexit 1\n`, 0o755);
  return { home, appRoot: join(home, '.local', 'share', 'snote-app'), wrap, log: join(wrap, 'tar.log'), curlLog: join(wrap, 'curl.log') };
}
type Run = { status: number | null; stdout: string; stderr: string };
/** Run the helper with `stdin` written to its pipe (or `stdinFd` as a non-pipe stdin); `ended` fires when snote's write finished. */
function helper(h: Home, stdin: Buffer | null, o: { swap?: string; stdinFd?: number; ended?: () => void } = {}): Promise<Run> {
  return new Promise((done) => {
    const env = { PATH: `${h.wrap}:/usr/bin:/bin`, HOME: h.home, SNOTE_NODE: process.execPath, TARLOG: h.log, CURLLOG: h.curlLog, SWAP: o.swap ?? '', SNOTE_INSTALL_BASE: 'http://127.0.0.1:9' };
    const c = spawn('bash', [installer, '--from-stdin'], { cwd: h.home, env, stdio: [o.stdinFd ?? 'pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.stdin?.on('error', () => {});
    if (stdin !== null) c.stdin?.end(stdin, () => o.ended?.());
    c.on('close', (status) => done({ status, stdout, stderr }));
  });
}
const payload = (tgz: Buffer, ver: string, hash = sha(tgz)): Buffer => Buffer.concat([Buffer.from(`${hash} ${ver}\n`), tgz]);
function snapshot(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) return [];
    return st.isDirectory() ? [`d ${p.slice(base.length)}`, ...snapshot(p, base)] : [`f ${p.slice(base.length)} ${sha(readFileSync(p))}`];
  });
}
const scratch = (h: Home): string[] => (existsSync(h.appRoot) ? readdirSync(h.appRoot).filter((x) => /^app\.[A-Za-z0-9]{6}$/.test(x)) : []);
const installedVersion = (h: Home): string => readFileSync(join(h.appRoot, 'app', 'VERSION'), 'utf8').trim();

const V1 = '0.2.11';
const V2 = '0.2.12';

describe('issues #340 #342 #343 (lane L5c): the update helper reads the verified release from snote on stdin', () => {
  it('1: WHEN the helper gets `<sha256> <version>` and the tarball on a pipe THEN it installs that version (a first install, then an update that keeps the first build as app.prev), with no download (SNOTE_INSTALL_BASE is ignored and the logging curl stub first on PATH is never run), the data folder unchanged and no stage left', async () => {
    const h = makeHome();
    const data = snapshot(join(h.home, '.local', 'share', 'snote'));
    const first = await helper(h, payload(release(V1), V1));
    expect([first.status, first.stderr]).toEqual([0, '']);
    expect(installedVersion(h)).toBe(V1);
    const second = await helper(h, payload(release(V2), V2));
    expect([second.status, second.stderr]).toEqual([0, '']);
    expect(second.stdout).toContain(`snote ${V2} is installed`);
    expect(installedVersion(h)).toBe(V2);
    expect(readFileSync(join(h.appRoot, 'app.prev', 'VERSION'), 'utf8').trim()).toBe(V1);
    expect(snapshot(join(h.home, '.local', 'share', 'snote'))).toEqual(data);
    expect(scratch(h)).toEqual([]);
    expect(existsSync(h.curlLog)).toBe(false);
  }, 30000);

  it('2: WHEN stdin is not a pipe, or the header is missing, over 128 bytes or not `<64 hex> <version>`, or the tarball is empty or over 8 MiB, or the header hash is not the tarball\'s THEN it exits non-zero with the one `snote install: ...; nothing was installed` line of that case, the curl stub is never run, and the installed build, the data folder and the app folder are byte for byte as they were', async () => {
    const h = makeHome();
    expect((await helper(h, payload(release(V1), V1))).status).toBe(0);
    const before = snapshot(h.home);
    const tgz = release(V2);
    const file = join(work, `stdin-${n++}`);
    writeFileSync(file, payload(tgz, V2));
    const fd = openSync(file, 'r');
    const bad: Array<[string, () => Promise<Run>, string]> = [
      ['not a pipe', () => helper(h, null, { stdinFd: fd }), "--from-stdin needs snote's pipe on stdin; nothing was installed"],
      ['no header', () => helper(h, Buffer.alloc(0)), 'the update from snote has no header line; nothing was installed'],
      ['long header', () => helper(h, Buffer.concat([Buffer.from('a'.repeat(200) + '\n'), tgz])), 'the update from snote has a bad header line; nothing was installed'],
      ['bad header', () => helper(h, Buffer.concat([Buffer.from(`${sha(tgz).toUpperCase()} ${V2}\n`), tgz])), 'the update from snote has a bad header line; nothing was installed'],
      ['path version', () => helper(h, Buffer.concat([Buffer.from(`${sha(tgz)} ../0.2.12\n`), tgz])), 'the update from snote has a bad header line; nothing was installed'],
      ['empty', () => helper(h, payload(Buffer.alloc(0), V2)), 'the update from snote is empty or too large; nothing was installed'],
      ['too large', () => helper(h, payload(Buffer.alloc(8 * 1024 * 1024 + 1, 1), V2)), 'the update from snote is empty or too large; nothing was installed'],
      ['hash', () => helper(h, payload(tgz, V2, sha(Buffer.from('other')))), 'checksum mismatch: the download is not the release it should be; nothing was installed'],
    ];
    for (const [why, run, says] of bad) {
      const r = await run();
      expect([why, r.status === 0, r.stderr.trim()]).toEqual([why, false, `snote install: ${says}`]);
    }
    closeSync(fd);
    expect(snapshot(h.home)).toEqual(before);
    expect(existsSync(h.curlLog)).toBe(false);
  }, 60000);

  it('3: WHEN the tarball\'s VERSION is not the header version THEN it refuses with `the archive holds another version than 0.2.12` and the old build stays', async () => {
    const h = makeHome();
    expect((await helper(h, payload(release(V1), V1))).status).toBe(0);
    const r = await helper(h, payload(release('0.2.13'), V2));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`the archive holds another version than ${V2}`);
    expect(installedVersion(h)).toBe(V1);
    expect(scratch(h)).toEqual([]);
  }, 30000);

  it('4: WHEN the work file is replaced after its first hash (here at listing time, by another valid build of the same version) THEN it refuses with `checksum mismatch: the download changed while it was unpacked`, the old build stays and the replacement is not installed', async () => {
    const h = makeHome();
    expect((await helper(h, payload(release(V1), V1))).status).toBe(0);
    const other = join(work, `swap-${n++}.tgz`);
    writeFileSync(other, release(V2, (dir) => put(join(dir, 'cli.js'), `console.log('snote ${V2}'); // swapped\n`)));
    const r = await helper(h, payload(release(V2), V2), { swap: other });
    expect(r.stderr).toContain('checksum mismatch: the download changed while it was unpacked');
    expect(r.status).not.toBe(0);
    expect(installedVersion(h)).toBe(V1);
    expect(readFileSync(join(h.appRoot, 'app', 'cli.js'), 'utf8')).not.toContain('swapped');
    expect(scratch(h)).toEqual([]);
  }, 30000);

  it('5: WHEN the tarball holds a symlink entry THEN the listing refuses it before anything is unpacked: tar runs only in list mode (`-tvzf`), never `-xzf`, and nothing is installed', async () => {
    const h = makeHome();
    const tgz = release(V2, (dir, list) => {
      symlinkSync('/etc/passwd', join(dir, 'link'));
      list.push('link');
    });
    const r = await helper(h, payload(tgz, V2));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('not a plain file or folder; nothing was installed');
    expect(readFileSync(h.log, 'utf8').split('\n').filter(Boolean)).toEqual(['-tvzf']);
    expect(existsSync(join(h.appRoot, 'app'))).toBe(false);
  }, 30000);

  it('6: WHEN a running snote holds the run lock THEN the helper still reads all of stdin (snote\'s write of about 1 MiB finishes while the lock is held), waits, and installs once the lock is free', async () => {
    const h = makeHome();
    expect((await helper(h, payload(release(V1), V1))).status).toBe(0);
    const lock = join(h.appRoot, 'run.lock');
    // the shim's way: a shared lock on fd 9, then exec, so the one process that holds it is the one killed
    const holder = spawn('sh', ['-c', 'exec 9>>"$1" && flock -s 9 && exec sleep 20', 'sh', lock], { stdio: 'ignore' });
    const held = (): boolean => spawnSync('flock', ['-n', '-x', lock, 'true']).status !== 0;
    while (!held()) await new Promise((r) => setTimeout(r, 20));
    // about 1 MiB that does not compress, so the write can finish only once the helper has read it
    const big = release(V2, (dir, list) => {
      writeFileSync(join(dir, 'big.bin'), randomBytes(1024 * 1024));
      list.push('big.bin');
    });
    let ended = false;
    let exited = false;
    const run = helper(h, payload(big, V2), { ended: () => (ended = true) }).finally(() => (exited = true));
    while (!ended && !exited) await new Promise((r) => setTimeout(r, 20));
    expect([ended, exited]).toEqual([true, false]);
    expect([held(), installedVersion(h)]).toEqual([true, V1]);
    holder.kill();
    const r = await run;
    expect([r.status, installedVersion(h)]).toEqual([0, V2]);
  }, 30000);

  it('7: WHEN plugin-dist is built THEN it holds `update-helper` with the bytes of packaging/direct/install, listed in its SHA256SUMS', async () => {
    const dir = await buildSplitDist();
    try {
      const helperBytes = readFileSync(join(dir, 'update-helper'));
      expect(helperBytes.equals(readFileSync(installer))).toBe(true);
      expect(readFileSync(join(dir, 'SHA256SUMS'), 'utf8').split('\n')).toContain(`${sha(helperBytes)}  update-helper`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('8: WHEN another install run removes the helper\'s scratch folder while the helper waits for the run lock THEN, once the lock is free, it exits non-zero with the one line `snote install: another install run removed the update from snote while waiting; nothing was installed`, the old build stays and no stage is left', async () => {
    const h = makeHome();
    expect((await helper(h, payload(release(V1), V1))).status).toBe(0);
    const lock = join(h.appRoot, 'run.lock');
    const holder = spawn('sh', ['-c', 'exec 9>>"$1" && flock -s 9 && exec sleep 20', 'sh', lock], { stdio: 'ignore' });
    const held = (): boolean => spawnSync('flock', ['-n', '-x', lock, 'true']).status !== 0;
    while (!held()) await new Promise((r) => setTimeout(r, 20));
    let ended = false;
    let exited = false;
    const run = helper(h, payload(release(V2), V2), { ended: () => (ended = true) }).finally(() => (exited = true));
    // the helper has read all of stdin and waits for the lock; its folder holds the written tarball
    const written = (): boolean => scratch(h).some((d) => existsSync(join(h.appRoot, d, `snote-${V2}.tar.gz`)));
    while (!(ended && written()) && !exited) await new Promise((r) => setTimeout(r, 20));
    expect([ended, exited, scratch(h).length]).toEqual([true, false, 1]);
    // what another run's leftover sweep does (packaging/direct/install, `rm -rf -- "$d"` on app.XXXXXX)
    for (const d of scratch(h)) rmSync(join(h.appRoot, d), { recursive: true, force: true });
    holder.kill();
    const r = await run;
    expect([r.status === 0, r.stderr.trim()]).toEqual([false, 'snote install: another install run removed the update from snote while waiting; nothing was installed']);
    expect([installedVersion(h), scratch(h)]).toEqual([V1, []]);
  }, 30000);
});
