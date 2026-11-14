import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { boundedRequest } from './bounded-request';
import * as rv from './release-verify'; // #30 L5c: static, as this whole module is loaded only by await import()
import { readRegularText, secureWriteFileSync } from './secure-fs';
import { compareVersions } from './update-state';

/**
 * #556 L3 (#341, #342): a direct install (kind `direct`) learns the
 * newest release and downloads it, verified, without installing anything.
 * Everything arrives over HTTPS from github.com's release assets through
 * boundedRequest with `redirect: 'manual'`: every hop is checked (https, no
 * userinfo, port 443, a host of the list), at most 3 redirects, 4 KiB for the
 * signed list and its signature, 8 MiB for the tarball, 120 s in all. The
 * signed list ASSETS.SHA256SUMS is checked with release-verify's ONE
 * ssh-keygen call against the INSTALLED allowed_signers, then parsed strictly
 * (the packaging/direct/install form); the tarball must match its line.
 * the verified tarball is returned as bytes in memory and never written
 * to a path, so nothing can be swapped in between this check and the install
 * (L5) that must consume the same bytes. Test seams are function parameters, not the
 * environment. Loaded by `await import()` only (#30 L5c: main's release check for a direct install, and
 * update-handoff after y and the save); the L5c part is at the end of this file.
 * proof: test/core/direct-download.test.ts
 * proof: test/structure/direct-lazy.test.ts
 */
type Fetch = typeof fetch;
type Run = typeof rv.defaultProcRunner;

const RELEASES = 'https://github.com/Donnishcomau/snote/releases/';
const HOSTS = ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
const MAX_REDIRECTS = 3;
const MAX_TARBALL = 8 * 1024 * 1024;
const MAX_TEXT = 4096;
const TOTAL_MS = 120_000;
const V = '[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}(?:\\.[0-9]{1,6})?';
const LIST = 'ASSETS.SHA256SUMS';
const AGENT = 'snote';

export interface DirectOpts {
  /** The running build's version (its plugin-dist VERSION); a release must be strictly newer. */
  runningVersion: string;
  /** The INSTALLED allowed_signers (never a downloaded one). */
  allowedSignersPath: string;
  /** The time limit over every request (default 120 s; #30 L5c: the release check passes 30 s). */
  timeoutMs?: number;
  /** Tests only (function parameters, not an env variable, a flag or a file): */
  fetch?: Fetch;
  run?: Run;
  sshKeygenPath?: string;
}
/** `bytes` is the verified tarball itself: the installer (#30, lane L5) must consume these bytes, never a file. */
export type DirectResult = { ok: true; version: string; commit: string; bytes: Buffer } | { ok: false; reason: string };
interface Assets {
  version: string;
  commit: string;
  tarSum: string;
}

const no = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function hopAllowed(u: URL): boolean {
  return u.protocol === 'https:' && u.username === '' && u.password === '' && u.port === '' && HOSTS.includes(u.hostname);
}

/**
 * One GET: redirects checked hop by hop, a size cap and one time limit over every hop. Null on anything wrong.
 * proof: test/core/direct-download.test.ts
 */
async function get(f: Fetch | undefined, first: string, cap: number, deadline: number): Promise<Buffer | null> {
  let url = new URL(first);
  if (url.hostname !== 'github.com' || !url.pathname.startsWith('/Donnishcomau/snote/releases/')) return null;
  for (let hops = 0; ; hops++) {
    if (!hopAllowed(url)) return null;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const res = await boundedRequest(
      url.href,
      { method: 'GET', credentials: 'omit', headers: { 'user-agent': AGENT } },
      { timeoutMs: left, maxBytes: cap, fetch: f, redirect: 'manual' }
    );
    if (res.status >= 300 && res.status < 400) {
      const where = res.headers.get('location');
      if (where === null || hops >= MAX_REDIRECTS) return null;
      url = new URL(where, url);
      continue;
    }
    return res.status === 200 ? res.bytes : null;
  }
}

/** ASSETS.SHA256SUMS, strictly: LF only, a final newline, `snote-assets <v> <40 hex>`, then the tarball line and the installer line, nothing else. */
export function parseAssets(buf: Buffer): Assets | null {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf) || !text.endsWith('\n') || text.includes('\r')) return null;
  const lines = text.slice(0, -1).split('\n');
  const head = new RegExp(`^snote-assets (${V}) ([0-9a-f]{40})$`).exec(lines[0] ?? '');
  if (head === null || lines.length !== 3) return null;
  const version = head[1] as string;
  const tar = new RegExp(`^([0-9a-f]{64})  snote-${version.replace(/\./g, '\\.')}\\.tar\\.gz$`).exec(lines[1] ?? '');
  if (tar === null || !/^[0-9a-f]{64}  snote-install$/.test(lines[2] ?? '')) return null;
  return { version, commit: head[2] as string, tarSum: tar[1] as string };
}

/** The signed list of the newest release: preflight, two small downloads, the signature, the strict parse. A string is the reason it failed. */
async function signedList(o: DirectOpts, deadline: number, newerOnly = true): Promise<Assets | string> {
  if (!new RegExp(`^${V}$`).test(o.runningVersion)) return 'The running version is not a plain version number.';
  const sshKeygen = o.sshKeygenPath ?? rv.SSH_KEYGEN;
  const pre = rv.signerPreflight(sshKeygen, o.allowedSignersPath);
  if (pre !== null) return pre;
  const text = await get(o.fetch, `${RELEASES}latest/download/${LIST}`, MAX_TEXT, deadline);
  const sig = text === null ? null : await get(o.fetch, `${RELEASES}latest/download/${LIST}.sig`, MAX_TEXT, deadline);
  if (text === null || sig === null) return 'The release list could not be downloaded.';
  const good = await rv.verifySignature({ run: o.run ?? rv.defaultProcRunner, sshKeygen, allowedSignersPath: o.allowedSignersPath, data: text, sig });
  if (!good) return 'The release list signature did not verify.';
  const list = parseAssets(text);
  if (list === null) return 'The release list is not in the expected form.';
  if (newerOnly && compareVersions(list.version, o.runningVersion) <= 0) return 'The release is not newer than the running version.';
  return list;
}

/**
 * The newest release's tarball, as verified bytes, only when the signed
 * list verifies with the INSTALLED allowed_signers, names a version strictly
 * newer than the running one and the tarball's sha256 matches its line.
 * Writes nothing; does not throw.
 * proof: test/core/direct-download.test.ts
 */
export async function downloadVerified(o: DirectOpts): Promise<DirectResult> {
  try {
    const deadline = Date.now() + (o.timeoutMs ?? TOTAL_MS);
    const list = await signedList(o, deadline);
    if (typeof list === 'string') return no(list);
    const bytes = await get(o.fetch, `${RELEASES}download/v${list.version}/snote-${list.version}.tar.gz`, MAX_TARBALL, deadline);
    if (bytes === null) return no('The release could not be downloaded.');
    if (createHash('sha256').update(bytes).digest('hex') !== list.tarSum) return no('The release does not match its signed hash.');
    return { ok: true, version: list.version, commit: list.commit, bytes };
  } catch {
    return no('The release could not be downloaded.');
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// #30 L5c (#340, #341, #342): the one-key update of a direct install. The running version is always the
// installed build's own VERSION file, not the network and not the saved answer. The release check reads the newest version from
// the signed list at start-up (unless a saved answer is under 24 h old) and every 24 h while snote is open; its cache
// holds only a time and a version, in snote's data folder, is written only after the list verified, and only decides
// whether snote offers the update. After y and the quit save, startDirectHandOff downloads the release again
// (downloadVerified, the INSTALLED allowed_signers) and writes one header line `<sha256> <version>` and then the
// verified bytes to the stdin of the installed build's own update-helper (packaging/direct/install) started with
// `--from-stdin` only: nothing goes into an argument, the environment or a file.
// proof: test/core/direct-update.test.ts
type Found = { version: string };
/** node's child-process starter, passed in by update-handoff.ts (eslint R1 #219 keeps it in that module). */
type Spawn = (cmd: string, args: string[], opts: { stdio: ['pipe', 'inherit', 'inherit']; env: NodeJS.ProcessEnv; detached: true }) => {
  once(event: 'error', listener: () => void): unknown;
  stdin: import('node:stream').Writable | null;
  unref(): void;
};

const VERSION_TEXT = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const quit = (why: string) => ({ code: 1, line: `snote did not update: ${why}` });
const FAILED = 'the update could not be downloaded and checked';

/** A regular file's text (no link, no FIFO: readRegularText), only when it is at most `cap` bytes; else ''. */
const small = (file: string, cap: number): string => {
  const t = readRegularText(file) ?? '';
  return Buffer.byteLength(t) <= cap ? t : '';
};

export interface Build {
  appDir: string;
  version: string;
}

/** The running direct build: the entry's folder is `<real share folder>/snote-app/app` and its VERSION is plain digits. */
export function installedBuild(entry: string | undefined, home: string): Build | null {
  try {
    const appDir = path.join(fs.realpathSync(path.join(home, '.local', 'share')), 'snote-app', 'app');
    const version = small(path.join(appDir, 'VERSION'), 64).trim();
    return path.dirname(fs.realpathSync(entry ?? '')) === appDir && VERSION_TEXT.test(version) ? { appDir, version } : null;
  } catch {
    return null;
  }
}

/** The cached newest version: exactly `{checkedAt, version}`, at most 4 KiB, checkedAt not in the future and under 24 h old. */
export function readSavedCheck(file: string, now: number): string | null {
  try {
    const v = JSON.parse(small(file, 4096)) as { checkedAt: unknown; version: unknown };
    const age = now - (v.checkedAt as number);
    const ok = Object.keys(v).sort().join() === 'checkedAt,version' && typeof v.checkedAt === 'number' && age >= 0 && age < 86_400_000;
    return ok && typeof v.version === 'string' && VERSION_TEXT.test(v.version) ? v.version : null;
  } catch {
    return null;
  }
}

/** The newest release for the banner: the cache when fresh, else the signed list (the cache is written only after it verified). */
export async function directNewest(o: { dataDir: string; build: Build; now?: () => number; list?: (o: DirectOpts) => Promise<{ version: string } | string> }): Promise<Found | null> {
  const now = (o.now ?? Date.now)();
  const file = path.join(o.dataDir, 'direct-release-check.json');
  const saved = readSavedCheck(file, now);
  if (saved !== null) return { version: saved };
  const opts = { runningVersion: o.build.version, allowedSignersPath: path.join(o.build.appDir, 'allowed_signers') };
  const r = await (o.list ?? ((x: DirectOpts) => signedList(x, Date.now() + 30_000, false).catch(() => 'failed')))(opts);
  if (typeof r === 'string' || !VERSION_TEXT.test(r.version)) return null;
  try {
    secureWriteFileSync(file, JSON.stringify({ checkedAt: now, version: r.version }) + '\n', { durable: false });
  } catch {
    // no cache next time (proof: test/core/direct-update.test.ts)
  }
  return { version: r.version };
}

/** main(): start the update watch (update-watch.ts, passed in) with this direct build's VERSION and the signed list; none without a valid VERSION. */
export function startDirectWatch(dataDir: string, home: string, watch: typeof import('./update-watch').startUpdateWatch): void {
  const build = installedBuild(process.argv[1], home);
  if (build !== null) watch({ version: build.version, home, env: process.env, newest: () => directNewest({ dataDir, build }) });
}

/**
 * After y and a save that held: `<app>/update-helper` must be a regular file (not a link) whose real path is in the build;
 * then download, pipe `<sha256> <version>` and the verified bytes to it, and return once they are written: snote then
 * exits, which frees the run lock the helper waits for. Every refusal is one fixed line, code 1.
 */
export async function startDirectHandOff(o: { home: string; env: NodeJS.ProcessEnv; entry?: string; log?: (line: string) => void; run: Spawn; download?: typeof downloadVerified }): Promise<{ code: number; line: string }> {
  const build = installedBuild(o.entry ?? process.argv[1], o.home);
  const helper = path.join(build?.appDir ?? '/', 'update-helper');
  let found = false;
  try {
    found = build !== null && fs.lstatSync(helper).isFile() && fs.realpathSync(helper).startsWith(build.appDir + '/');
  } catch {
    // not found
  }
  if (!found || build === null) return quit('the update script was not found');
  o.log?.('snote is downloading the update and checking its signature');
  const r = await (o.download ?? downloadVerified)({ runningVersion: build.version, allowedSignersPath: path.join(build.appDir, 'allowed_signers') });
  if (!r.ok) return quit(FAILED);
  return new Promise((resolve) => {
    try {
      // detached: its own session and group, so the terminal closing as snote quits does not hang it up (proof: test/core/direct-update.test.ts)
      const child = o.run(helper, ['--from-stdin'], { stdio: ['pipe', 'inherit', 'inherit'], env: o.env, detached: true });
      child.once('error', () => resolve(quit(FAILED)));
      child.stdin?.once('error', () => resolve(quit(FAILED)));
      child.stdin?.end(Buffer.concat([Buffer.from(`${createHash('sha256').update(r.bytes).digest('hex')} ${r.version}\n`), r.bytes]), (err?: Error | null) => {
        child.unref();
        resolve(err ? quit(FAILED) : { code: 0, line: '' });
      });
    } catch {
      resolve(quit(FAILED));
    }
  });
}
