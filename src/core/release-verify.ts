import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkInstalledAllowedSigners } from './allowed-signers';
import { secureExclusiveCreate, secureMkdtemp, secureRemoveTree } from './secure-fs';
import { REMOTE_GIT_FLAGS, gitEnv } from './update-check';
import { compareVersions } from './update-state';

/**
 * #68b (SECURITY MUST 2, 6, 7, 8, 9, 11, 20): decide whether one fetched
 * release commit may be installed. Every byte comes from the clone's object
 * store (`git ls-tree`, `git cat-file --batch`), never from the work tree; the
 * signature is checked against the INSTALLED `allowed_signers` only.
 */
export type ProcRunner = (
  file: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv; input?: Buffer }
) => Promise<{ code: number | null; stdout: Buffer }>;

export interface VerifyOpts {
  cloneDir: string;
  commit: string;
  tag: string;
  runningVersion: string;
  allowedSignersPath: string;
  run?: ProcRunner;
  /** Tests only: where ssh-keygen is looked for. Default `/usr/bin/ssh-keygen`. */
  sshKeygenPath?: string;
}
export type VerifyResult = { ok: true; version: string } | { ok: false; reason: string };

export const SSH_KEYGEN = '/usr/bin/ssh-keygen';
const NAMESPACE = 'snote-release';
const TIMEOUT_MS = 10_000;
/** One process's output (R1, #219: maxBuffer 1048576); the blobs are read in groups that fit it. */
const READ_CAP = 1048576;
/** Room for one `<oid> blob <size>` header and its trailing LF in `git cat-file --batch` output. */
const BATCH_HEAD = 64;
/** The whole release tree is at most 8 MiB, checked from the ls-tree sizes before any blob is read. */
const TREE_CAP = 8 * 1048576;
const VERSION_RE = /^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:\.[0-9]{1,6})?$/;
const SUM_RE = /^([0-9a-f]{64}) {2}(.+)$/;
const GOOD_PREFIX = 'Good "snote-release" signature for snote-release with ';
export const NEEDS_OPENSSH = 'update refused: OpenSSH (ssh-keygen) is needed to verify updates';
/** V465-01 (CWE-757): the running version must match MUST 2's grammar, else the not-newer check below cannot be trusted (compareVersions returns NaN). */
const BAD_RUNNING_VERSION = 'The running version is not a plain version number.';
/** SG-6 and no absolute path, no `..` path segment (`a..b` is legal), no control (C0, C1), bidi or backslash character. */
const C1_BIDI = '\\u0080-\\u009f\\u202a-\\u202e\\u2066-\\u2069';
export const BAD_PATH_RE = new RegExp('^/|(?:^|/)\\.\\.(?:/|$)|[\\u0000-\\u001f\\u007f' + C1_BIDI + '\\\\]');
const MANIFEST = 'SHA256SUMS';
const SIG = 'SHA256SUMS.sig';

/** Real runner: no shell, bytes out, never rejects, output over 1 MiB kills the child. */
export const defaultProcRunner: ProcRunner = (file, args, opts) =>
  new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs, env: opts.env, maxBuffer: 1048576, encoding: 'buffer' },
      (error, stdout) => {
        const out = Buffer.isBuffer(stdout) ? stdout : Buffer.alloc(0);
        const err = error as (NodeJS.ErrnoException & { killed?: boolean; signal?: string | null }) | null;
        if (!err) resolve({ code: 0, stdout: out });
        else if (err.killed === true || err.signal != null || typeof err.code !== 'number') resolve({ code: null, stdout: out });
        else resolve({ code: err.code, stdout: out });
      }
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(opts.input ?? Buffer.alloc(0));
  });

/** The env for every call: no GIT_*, no SSH_AUTH_SOCK (a signing agent hangs ssh-keygen). */
/** SG-5: ssh-keygen must be a regular file of root, writable by no one else. */
function sshKeygenUsable(file: string): boolean {
  try {
    const st = fs.lstatSync(file);
    return st.isFile() && st.uid === 0 && (st.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = gitEnv(env);
  delete out.SSH_AUTH_SOCK;
  return out;
}

/** `git cat-file --batch` output: `<oid> blob <size>` LF, the bytes, LF, once per id in order. Null when it does not parse exactly. */
function parseBatch(buf: Buffer, ids: string[]): Map<string, Buffer> | null {
  const out = new Map<string, Buffer>();
  let pos = 0;
  for (const id of ids) {
    const nl = buf.indexOf(0x0a, pos);
    const head = nl < 0 ? null : /^([0-9a-f]{40}) blob ([0-9]+)$/.exec(buf.toString('latin1', pos, nl));
    if (!head || head[1] !== id) return null;
    const start = nl + 1;
    const end = start + Number(head[2]);
    if (end >= buf.length || buf[end] !== 0x0a) return null;
    out.set(id, buf.subarray(start, end));
    pos = end + 1;
  }
  return pos === buf.length ? out : null;
}

const no = (reason: string): VerifyResult => ({ ok: false, reason });

export async function verifyReleaseCommit(opts: VerifyOpts): Promise<VerifyResult> {
  let tmp: string | null = null;
  try {
    if (!VERSION_RE.test(opts.runningVersion)) return no(BAD_RUNNING_VERSION);
    const run = opts.run ?? defaultProcRunner;
    const env = cleanEnv(process.env);
    const git = (args: string[], input?: Buffer): ReturnType<ProcRunner> =>
      run('git', [...REMOTE_GIT_FLAGS, ...args], { cwd: opts.cloneDir, timeoutMs: TIMEOUT_MS, env, input });
    const sshKeygen = opts.sshKeygenPath ?? SSH_KEYGEN;
    if (!sshKeygenUsable(sshKeygen)) return no(NEEDS_OPENSSH);
    if (!path.isAbsolute(opts.allowedSignersPath)) return no('The installed allowed_signers path is not absolute.');
    const signers = checkInstalledAllowedSigners(opts.allowedSignersPath);
    if (signers.ok === false) return no(signers.reason);
    if (!/^[0-9a-f]{40}$/.test(opts.commit)) return no('The release commit is not a full commit id.');
    const tagVersion = /^v(.+)$/.exec(opts.tag)?.[1];
    if (tagVersion === undefined || !VERSION_RE.test(tagVersion)) return no('The release tag is not a version.');

    // 1. The tree of the fetched commit, from the object store, with each blob's size.
    const ls = await git(['ls-tree', '-r', '-l', '-z', '--full-tree', opts.commit]);
    if (ls.code !== 0) return no('The release commit could not be read.');
    const blobs = new Map<string, string>();
    const sizes = new Map<string, number>();
    let total = 0;
    for (const rec of ls.stdout.toString('utf8').split('\0')) {
      if (rec === '') continue;
      const m = /^(100644|100755) blob ([0-9a-f]{40}) +([0-9]+)\t(.+)$/s.exec(rec);
      if (!m) return no('The release holds an entry that is not a plain file.');
      if (blobs.has(m[4] as string)) return no('The release holds a file twice.');
      blobs.set(m[4] as string, m[2] as string);
      sizes.set(m[2] as string, Number(m[3]));
      total += Number(m[3]);
      if (total > TREE_CAP) return no('The release is larger than 8 MiB.');
    }
    // `git cat-file --batch` over groups of blobs whose output fits one read: bytes from the object store.
    // A blob too large for one read gets a group of its own, and that read fails, so the release is refused.
    const groups: string[][] = [];
    let used = READ_CAP;
    for (const id of new Set(blobs.values())) {
      const need = (sizes.get(id) ?? READ_CAP) + BATCH_HEAD;
      if (used + need > READ_CAP) {
        groups.push([]);
        used = 0;
      }
      (groups[groups.length - 1] as string[]).push(id);
      used += need;
    }
    const contents = new Map<string, Buffer>();
    for (const ids of groups) {
      const cat = await git(['cat-file', '--batch'], Buffer.from(`${ids.join('\n')}\n`));
      const part = cat.code === 0 ? parseBatch(cat.stdout, ids) : null;
      if (part === null) return no('The release files could not be read.');
      for (const [id, bytes] of part) contents.set(id, bytes);
    }
    const manifestId = blobs.get(MANIFEST);
    const sigId = blobs.get(SIG);
    if (manifestId === undefined || sigId === undefined) return no('The release has no signed manifest.');
    const manifest = contents.get(manifestId) ?? null;
    const sig = contents.get(sigId) ?? null;
    if (manifest === null || sig === null) return no('The signed manifest could not be read.');

    // 2. The signature, against the installed allowed_signers only.
    tmp = secureMkdtemp(path.join(os.tmpdir(), 'snote-verify-'));
    const sigFile = path.join(tmp, SIG);
    secureExclusiveCreate(sigFile, sig.toString('utf8'), 0o600); // an armored signature is ASCII; other bytes cannot verify
    const v = await run(
      sshKeygen,
      ['-Y', 'verify', '-f', opts.allowedSignersPath, '-I', NAMESPACE, '-n', NAMESPACE, '-s', sigFile],
      { cwd: tmp, timeoutMs: TIMEOUT_MS, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, input: manifest }
    );
    if (v.code !== 0 || !v.stdout.toString('utf8').startsWith(GOOD_PREFIX)) return no('The release signature did not verify.');

    // 3. The manifest: version line, then one sha256 per file.
    const lines = manifest.toString('utf8').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const head = /^snote (\S+) ([0-9a-f]{40})$/.exec(lines[0] ?? '');
    if (!head || !VERSION_RE.test(head[1] as string)) return no('The manifest has no version line.');
    const version = head[1] as string;
    if (version !== tagVersion) return no('The signed version differs from the tag.');
    if (compareVersions(version, opts.runningVersion) <= 0) return no('The release is not newer than the running version.');
    const listed = new Map<string, string>();
    let last = '';
    for (const line of lines.slice(1)) {
      const m = SUM_RE.exec(line);
      const file = m?.[2] as string;
      // strictly sorted by path: no duplicate, no disorder
      if (!m || BAD_PATH_RE.test(file) || file <= last) return no('The manifest has a bad line.');
      listed.set(file, m[1] as string);
      last = file;
    }
    const files = [...blobs.keys()].filter((p) => p !== MANIFEST && p !== SIG);
    if (files.length !== listed.size || files.some((p) => !listed.has(p))) return no('The manifest and the release files differ.');
    for (const p of files) {
      const bytes = contents.get(blobs.get(p) as string) ?? null;
      if (bytes === null) return no('A release file could not be read.');
      if (createHash('sha256').update(bytes).digest('hex') !== listed.get(p)) return no('A release file does not match the manifest.');
    }
    return { ok: true, version };
  } catch {
    return no('The release could not be verified.');
  } finally {
    if (tmp !== null) {
      try {
        secureRemoveTree(tmp);
      } catch {
        // EACCES, EPERM or EBUSY on a private temp dir: it holds one signature file, and the verdict stands
      }
    }
  }
}
