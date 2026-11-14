/**
 * #556 L3 (#341, #342, #343): downloadVerified decides from a
 * signed ASSETS.SHA256SUMS and the INSTALLED allowed_signers only, and hand back the verified
 * tarball as bytes, never a path. The release is served by an injected fetch (a function
 * parameter): no socket is opened. The keys and the signatures are real ssh-keygen output.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { downloadVerified, type DirectOpts } from '../../src/core/direct-download';
import { defaultProcRunner } from '../../src/core/release-verify';

const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: os.tmpdir() };
const L = 'https://github.com/Donnishcomau/snote/releases/latest/download/';
const D = 'https://github.com/Donnishcomau/snote/releases/download/v0.2.9/';
const CDN = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/';
const TAR = Buffer.from('tarball of 0.2.9\n');
const roots: string[] = [];
afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

interface Key { file: string; line: string }
interface World { root: string; installed: string; main: Key; attacker: Key }
function sh(args: string[], cwd: string): void {
  execFileSync('/usr/bin/ssh-keygen', args, { cwd, env: ENV, stdio: 'pipe' });
}
function makeKey(root: string, name: string): Key {
  const file = path.join(root, name);
  sh(['-q', '-t', 'ed25519', '-N', '', '-f', file], root);
  const [type, b64] = fs.readFileSync(`${file}.pub`, 'utf8').trim().split(' ');
  return { file, line: `snote-release namespaces="snote-release" ${type} ${b64} ${name}\n` };
}
let base: World | undefined;
/** The keys are made once (ssh-keygen is slow under load). */
function makeWorld(): World {
  if (base === undefined) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-556l3-'));
    roots.push(root);
    const main = makeKey(root, 'main');
    const installed = path.join(root, 'allowed_signers');
    fs.writeFileSync(installed, main.line + makeKey(root, 'backup').line);
    fs.chmodSync(installed, 0o644);
    base = { root, installed, main, attacker: makeKey(root, 'attacker') };
  }
  return base;
}
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const listText = (v: string, tar: Buffer = TAR): string =>
  `snote-assets ${v} ${'c'.repeat(40)}\n${sha(tar)}  snote-${v}.tar.gz\n${'d'.repeat(64)}  snote-install\n`;
const signed = new Map<string, { text: Buffer; sig: Buffer }>();
function sign(w: World, text: string, key: Key): { text: Buffer; sig: Buffer } {
  const id = `${key.file}\n${text}`;
  const hit = signed.get(id);
  if (hit !== undefined) return hit;
  const f = path.join(w.root, `list-${signed.size}`);
  fs.writeFileSync(f, text);
  sh(['-Y', 'sign', '-f', key.file, '-n', 'snote-release', f], w.root);
  const out = { text: Buffer.from(text), sig: fs.readFileSync(`${f}.sig`) };
  signed.set(id, out);
  return out;
}

type Handler = () => Response;
const ok = (b: Buffer | string): Handler => () => new Response(typeof b === 'string' ? b : new Uint8Array(b), { status: 200 });
const redirect = (to: string): Handler => () => new Response(null, { status: 302, headers: { location: to } });
interface Fake { f: typeof fetch; calls: { url: string; init: RequestInit }[] }
function fake(routes: Record<string, Handler>): Fake {
  const calls: Fake['calls'] = [];
  const f = (async (input: string, init: RequestInit) => {
    calls.push({ url: String(input), init });
    const h = routes[String(input)];
    return h === undefined ? new Response(null, { status: 404 }) : h();
  }) as unknown as typeof fetch;
  return { f, calls };
}
/** A normal release: the list (two hops, as GitHub does), its signature, and the tarball (one hop to the asset host). */
function release(w: World, o: { version?: string; key?: Key; tar?: Buffer; served?: Handler; text?: string } = {}): Record<string, Handler> {
  const v = o.version ?? '0.2.9';
  const tar = o.tar ?? TAR;
  const s = sign(w, o.text ?? listText(v, tar), o.key ?? w.main);
  return {
    [`${L}ASSETS.SHA256SUMS`]: redirect(`https://github.com/Donnishcomau/snote/releases/download/v${v}/ASSETS.SHA256SUMS`),
    [`https://github.com/Donnishcomau/snote/releases/download/v${v}/ASSETS.SHA256SUMS`]: redirect(`${CDN}list`),
    [`${CDN}list`]: ok(s.text),
    [`${L}ASSETS.SHA256SUMS.sig`]: ok(s.sig),
    [`https://github.com/Donnishcomau/snote/releases/download/v${v}/snote-${v}.tar.gz`]: redirect(`${CDN}tar`),
    [`${CDN}tar`]: o.served ?? ok(tar),
  };
}
const opts = (w: World, fx: Fake, more: Partial<DirectOpts> = {}): DirectOpts => ({
  runningVersion: '0.2.8',
  allowedSignersPath: w.installed,
  fetch: fx.f,
  ...more,
});
const BIG = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
// a signed tree manifest (line 1 `snote ...`) that is otherwise shaped like the list
const TREE = `snote 0.2.9 ${'c'.repeat(40)}\n${sha(TAR)}  snote-0.2.9.tar.gz\n${'d'.repeat(64)}  snote-install\n`;
// ssh-keygen is slow under load: make the keys and sign every list the tests use before the first test starts
beforeAll(() => {
  const w = makeWorld();
  release(w);
  release(w, { key: w.attacker });
  release(w, { version: '0.2.8' });
  release(w, { version: '0.2.7' });
  release(w, { text: TREE });
  release(w, { tar: BIG });
}, 60000);

describe('#556 L3 direct download', () => {
  it('2: WHEN `downloadVerified` runs against a fixture release THEN it returns `{ ok: true, version: \'0.2.9\' }` with the tarball as bytes and no path, after one ssh-keygen verify with the INSTALLED allowed_signers, and every request carries `user-agent: snote`, `redirect: manual` and no credentials', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_secret');
    const w = makeWorld();
    const fx = fake(release(w));
    const ssh: string[][] = [];
    const run: DirectOpts['run'] = (file, args, o) => (ssh.push(args), defaultProcRunner(file, args, o));
    const r = await downloadVerified(opts(w, fx, { run }));
    expect(r).toMatchObject({ ok: true, version: '0.2.9', commit: 'c'.repeat(40) });
    if (!r.ok) return;
    expect(Object.keys(r).sort()).toEqual(['bytes', 'commit', 'ok', 'version']);
    expect(r.bytes).toEqual(TAR);
    expect(ssh).toHaveLength(1);
    expect(ssh[0]?.slice(0, 4)).toEqual(['-Y', 'verify', '-f', w.installed]);
    expect(fx.calls.map((c) => c.url)).toEqual([
      `${L}ASSETS.SHA256SUMS`, `${D}ASSETS.SHA256SUMS`, `${CDN}list`,
      `${L}ASSETS.SHA256SUMS.sig`,
      `${D}snote-0.2.9.tar.gz`, `${CDN}tar`,
    ]);
    for (const c of fx.calls) {
      expect(c.init.redirect).toBe('manual');
      expect(c.init.credentials).toBe('omit');
      const h = new Headers(c.init.headers);
      expect(h.get('user-agent')).toBe('snote');
      expect(h.has('authorization') || h.has('cookie')).toBe(false);
    }
  });

  it('3: WHEN the signature is by an unpinned key, an allowed_signers asset is served, the sha differs, the version is equal or older, the list is the tree manifest, the tarball is over 8 MiB, the running version is not plain, `ssh-keygen` is missing or the time limit passes THEN the result is `{ ok: false }` with its reason', async () => {
    const w = makeWorld();
    const run = async (routes: Record<string, Handler>, more: Partial<DirectOpts> = {}) => {
      const fx = fake(routes);
      return { r: await downloadVerified(opts(w, fx, more)), fx };
    };
    expect((await run(release(w, { key: w.attacker }))).r).toEqual({ ok: false, reason: 'The release list signature did not verify.' });
    // the attacker also serves his own allowed_signers asset: it is never requested
    const evil = release(w, { key: w.attacker });
    evil[`${L}allowed_signers`] = ok(w.attacker.line + w.main.line);
    const evilRun = await run(evil);
    expect(evilRun.r.ok).toBe(false);
    expect(evilRun.fx.calls.some((c) => c.url.includes('allowed_signers'))).toBe(false);
    expect((await run(release(w, { served: ok(Buffer.from('other bytes\n')) }))).r).toEqual({ ok: false, reason: 'The release does not match its signed hash.' });
    // equal and older versions, both validly signed (a replay or a downgrade,)
    expect((await run(release(w, { version: '0.2.8' }))).r).toEqual({ ok: false, reason: 'The release is not newer than the running version.' });
    expect((await run(release(w, { version: '0.2.7' }))).r).toEqual({ ok: false, reason: 'The release is not newer than the running version.' });
    // the signed tree SHA256SUMS served as the list (type confusion,)
    expect((await run(release(w, { text: TREE }))).r).toEqual({ ok: false, reason: 'The release list is not in the expected form.' });
    expect((await run(release(w, { tar: BIG }))).r).toEqual({ ok: false, reason: 'The release could not be downloaded.' });
    const odd = await run(release(w), { runningVersion: '0.2.8-dev' });
    expect(odd.r).toEqual({ ok: false, reason: 'The running version is not a plain version number.' });
    expect(odd.fx.calls).toEqual([]);
    const noSsh = await run(release(w), { sshKeygenPath: path.join(w.root, 'no-ssh-keygen') });
    expect(noSsh.r).toEqual({ ok: false, reason: 'update refused: OpenSSH (ssh-keygen) is needed to verify updates' });
    expect(noSsh.fx.calls).toEqual([]);
    const slow = fake({ [`${L}ASSETS.SHA256SUMS`]: () => new Response(new ReadableStream({ start() { /* never closes */ } }), { status: 200 }) });
    expect((await downloadVerified(opts(w, slow, { timeoutMs: 50 }))).ok).toBe(false);
  });

  it('4: WHEN a redirect leaves the allowed hosts, the scheme is not https, carries userinfo or a port, or there are more than 3 redirects THEN the download stops with `{ ok: false }` at that hop', async () => {
    const w = makeWorld();
    const base = release(w);
    const stops = async (to: string, hops = 0): Promise<string[]> => {
      const routes = { ...base, [`${L}ASSETS.SHA256SUMS`]: redirect(to) };
      for (let i = 0; i < hops; i++) routes[`https://github.com/hop/${i}`] = redirect(i === hops - 1 ? `${CDN}list` : `https://github.com/hop/${i + 1}`);
      const fx = fake(routes);
      expect((await downloadVerified(opts(w, fx))).ok).toBe(false);
      return fx.calls.map((c) => c.url);
    };
    expect(await stops('https://evil.example/list')).toEqual([`${L}ASSETS.SHA256SUMS`]);
    expect(await stops(`http://github.com/Donnishcomau/snote/releases/download/v0.2.9/ASSETS.SHA256SUMS`)).toEqual([`${L}ASSETS.SHA256SUMS`]);
    // userinfo, written as joined strings so the export's address scan does not read it as an address
    expect(await stops(`https://user:pw${'@'}github.com/Donnishcomau/snote/releases/download/v0.2.9/ASSETS.SHA256SUMS`)).toEqual([`${L}ASSETS.SHA256SUMS`]);
    expect(await stops(`https://github.com:8443/Donnishcomau/snote/releases/download/v0.2.9/ASSETS.SHA256SUMS`)).toEqual([`${L}ASSETS.SHA256SUMS`]);
    expect(await stops('https://githubusercontent.com.evil.example/list')).toEqual([`${L}ASSETS.SHA256SUMS`]);
    expect(await stops('https://github.com/hop/0', 4)).toHaveLength(4);
    const three = fake({ ...base, [`${L}ASSETS.SHA256SUMS`]: redirect('https://github.com/hop/0'), 'https://github.com/hop/0': redirect('https://github.com/hop/1'), 'https://github.com/hop/1': redirect(`${CDN}list`) });
    expect(await downloadVerified(opts(w, three))).toMatchObject({ ok: true, version: '0.2.9' });
  });

  it('5: WHEN the served tarball changes after it was fetched and verified THEN the result holds exactly the verified bytes and the tarball is requested `1` time (no second read for the installer to consume)', async () => {
    const w = makeWorld();
    let served = 0;
    const swap: Handler = () => new Response(new Uint8Array(served++ === 0 ? TAR : Buffer.from('swapped tarball\n')), { status: 200 });
    const fx = fake(release(w, { served: swap }));
    const r = await downloadVerified(opts(w, fx));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes).toEqual(TAR);
    expect(fx.calls.filter((c) => c.url === `${CDN}tar`)).toHaveLength(1);
  });
});
