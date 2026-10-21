import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { secureWriteFileSync } from './secure-fs';
import { compareVersions } from './update-state';

/**
 * Update notice U2 core (T386): ask the plugin clone's origin once a
 * day whether a newer HEAD is out there. Anonymous and silent: the
 * only remote command is `git ls-remote <url> HEAD` against the
 * clone's own origin, never anything that moves local refs or opens
 * an HTTP client. Offline or broken, it says `unknown` and writes
 * nothing; the user opts out with SNOTE_UPDATE_CHECK=off (or 0).
 *
 * Hardening (T415): the clone's `.git/config` is untrusted input —
 * `core.sshCommand`, `remote.origin.uploadpack` or an `ext::` url in
 * there would run a program once a day. So snote reads the origin
 * url itself from the config file (never through git), accepts only
 * `https://` urls and absolute local paths, and runs `ls-remote`
 * with cwd `/` (never the clone and never the temp dir, so no git
 * config at or above either is read) with the environment stripped of
 * every `GIT_*` variable.
 */

/**
 * Opt-out switch: the check runs unless SNOTE_UPDATE_CHECK is exactly
 * `off` or `0`.
 */
export function updateCheckEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.SNOTE_UPDATE_CHECK;
  return !(v === 'off' || v === '0');
}

/**
 * Injectable git runner so no test ever reaches the network.
 * Resolves with the exit code and stdout; never rejects.
 */
export type GitRunner = (
  args: string[],
  opts: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }
) => Promise<{ code: number | null; stdout: string }>;

const GIT_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TAG_CACHE_FILE = 'update-tag-check.json';

interface UpdateCheckCache {
  checkedAt: number;
  remoteHead: string;
}

/**
 * The environment handed to every git call: the caller's env without
 * any variable whose name starts with `GIT_` (so no inherited
 * `GIT_DIR`, `GIT_SSH_COMMAND`, ... reaches git), plus
 * `GIT_TERMINAL_PROMPT=0`.
 */
function gitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('GIT_')) {
      out[key] = value;
    }
  }
  out.GIT_TERMINAL_PROMPT = '0';
  out.GIT_CONFIG_NOSYSTEM = '1';
  return out;
}

/**
 * F235 (SECURITY MUST 6): the config flags every remote git call carries,
 * so a configured credential helper, hook path or fsmonitor never runs from
 * the background check and only https (or a local path) is spoken. They
 * come before the subcommand, as git requires.
 */
const REMOTE_GIT_FLAGS = [
  '-c', 'credential.helper=',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'protocol.allow=never',
  '-c', 'protocol.https.allow=always',
];

/**
 * The flags for one remote call. A local absolute-path origin (reached only
 * in tests; production refuses it) is the `file` protocol, which
 * `protocol.allow=never` would block, so it alone gets
 * `protocol.file.allow=always`. An https origin gets exactly MUST 6's set.
 */
function remoteGitFlags(url: string): string[] {
  return url.startsWith('/') ? [...REMOTE_GIT_FLAGS, '-c', 'protocol.file.allow=always'] : REMOTE_GIT_FLAGS;
}

/**
 * Read the origin url straight from `<cloneDir>/.git/config` without
 * running git. Returns the trimmed `url` value of the first entry
 * line of the `[remote "origin"]` section, or null when the file or
 * the setting is missing or unreadable. Section headers are matched
 * so a `url` line from another section never counts.
 */
function readOriginUrl(cloneDir: string): string | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(cloneDir, '.git', 'config'), 'utf8');
  } catch {
    return null;
  }
  let inOrigin = false;
  for (const line of text.split('\n')) {
    const header = /^\s*\[([^\]]*)\]\s*$/.exec(line);
    if (header) {
      const name = header[1]
        .split(/\s+/g)
        .map((part) => part.trim().replace(/^"(.*)"$/s, '$1'))
        .join(' ');
      inOrigin = name === 'remote origin';
      continue;
    }
    if (inOrigin) {
      const match = /^\s*url\s*=\s*(.*)$/.exec(line);
      if (match) {
        return match[1].trim() || null;
      }
    }
  }
  return null;
}

/**
 * Only an `https://` url or an absolute local path is safe to hand
 * to git: ssh, `ext::`, `git://` and anything else are refused
 * before git ever runs.
 */
function isSafeRemoteUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('/');
}

/**
 * Run git without a shell, resolving (never rejecting) with git's
 * real exit code and stdout. A child killed by its timeout (or by a
 * signal) and a child that could not start at all report code
 * `null`, so a caller can tell "git answered 1" apart from "git
 * never answered".
 */
export const defaultGitRunner: GitRunner = (args, opts) =>
  new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs, env: opts.env },
      (error, stdout) => {
        if (!error) {
          resolve({ code: 0, stdout: String(stdout ?? '') });
          return;
        }
        const err = error as NodeJS.ErrnoException & {
          killed?: boolean;
          signal?: NodeJS.Signals | null;
        };
        if (err.killed === true || err.signal != null) {
          // killed on timeout or by a signal: git never answered
          resolve({ code: null, stdout: String(stdout ?? '') });
        } else if (typeof err.code === 'number') {
          resolve({ code: err.code, stdout: String(stdout ?? '') });
        } else {
          // could not start (no such command, bad cwd): git never answered
          resolve({ code: null, stdout: String(stdout ?? '') });
        }
      }
    );
    // Defensive: no child handle at all means git never started.
    if (!child) {
      resolve({ code: null, stdout: '' });
    }
  });

/**
 * One call to git inside the clone, on the same env rules as every
 * other call (caller's env minus `GIT_*`, plus
 * `GIT_TERMINAL_PROMPT=0`) and the same timeout.
 */
function runInClone(
  run: GitRunner,
  cloneDir: string,
  env: NodeJS.ProcessEnv,
  args: string[]
): Promise<{ code: number | null; stdout: string }> {
  return run(args, {
    cwd: cloneDir,
    timeoutMs: GIT_TIMEOUT_MS,
    env: gitEnv(env),
  });
}

/**
 * Is the remote head something the clone does not have yet? `git
 * cat-file -e <remote>^{commit}` first: a non-zero answer through a
 * real git means the clone never fetched the remote commit, so
 * without fetching git cannot tell more and the update is `available`
 * (the check never fetches). A `null` code — a child killed by its
 * timeout or one that never started — is no answer at all, so it
 * reads `unknown` rather than pretending the commit is missing. When
 * the clone does have the commit,
 * `git merge-base --is-ancestor <local> <remote>` decides: exit 0
 * says the remote is ahead (`available`); exit 1 says the clone is
 * ahead of the remote head or diverged from it, which is `current`.
 * Any other code — `null` from a child killed by its timeout or one
 * that never started, or anything else git did not really answer —
 * is no answer at all, so the caller reports `unknown` and nothing
 * is announced. A test double that answers every call the same way
 * carries a plain code on these calls, so a differing pair stays
 * `available` for it.
 */
async function remoteIsAhead(
  run: GitRunner,
  cloneDir: string,
  env: NodeJS.ProcessEnv,
  localHead: string,
  remoteHead: string
): Promise<'available' | 'current' | 'unknown'> {
  const hasRemote = await runInClone(run, cloneDir, env, [
    'cat-file',
    '-e',
    `${remoteHead}^{commit}`,
  ]);
  if (hasRemote.code === null) {
    // git never answered (timeout or child that could not start):
    // no evidence the commit is missing, so nothing is announced.
    return 'unknown';
  }
  if (hasRemote.code !== 0) {
    return 'available';
  }
  const ancestor = await runInClone(run, cloneDir, env, [
    'merge-base',
    '--is-ancestor',
    localHead,
    remoteHead,
  ]);
  if (ancestor.code === 0) {
    return 'available';
  }
  if (ancestor.code === 1) {
    return 'current';
  }
  return 'unknown';
}

/**
 * The shape git itself writes for a head id: 1 to 64 lowercase hex
 * characters (40 for SHA-1, 64 for SHA-256). A short token from a
 * test double stays valid here; anything with another character in
 * it — `--options`, `$(...)`, a path — is never a commit id and must
 * not reach git as an argument or the cache.
 */
function isValidCommitId(head: string): boolean {
  return /^[0-9a-f]{1,64}$/.test(head);
}

/**
 * Outcome of the remote update check. `disabled` means the user
 * opted out; `unknown` means the answer was unavailable (offline, no
 * clone, failing git) and nothing was written.
 */
type RemoteUpdateResult = {
  state: 'available' | 'current' | 'unknown' | 'disabled';
};

function readCache(file: string): UpdateCheckCache | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<UpdateCheckCache> | null;
    if (
      parsed &&
      typeof parsed.checkedAt === 'number' &&
      typeof parsed.remoteHead === 'string' &&
      parsed.remoteHead.length > 0 &&
      isValidCommitId(parsed.remoteHead)
    ) {
      return { checkedAt: parsed.checkedAt, remoteHead: parsed.remoteHead };
    }
  } catch {
    // unreadable or malformed cache counts as no cache
  }
  return null;
}

/**
 * Ask the clone's origin whether its HEAD moved, at most once per
 * 24 h. Fresh cache: the origin url comes from the clone's
 * `.git/config` read without git, and only an `https://` url or an
 * absolute path is used — anything else answers `unknown` with no
 * runner call and no cache write. `ls-remote <url> HEAD` then runs
 * with timeoutMs 5000 from `/` (never the clone and never the temp
 * dir, so no git config at or above either is read for it), and the
 * cache is written only after it succeeds. A head that is not 1 to
 * 64 lowercase hex characters — from `ls-remote` or from the cache
 * file — is never a commit id: the answer is `unknown`, nothing is
 * written, and a cached one counts as no cache at all (the origin is
 * asked again). A cache younger than 24 h replaces the remote call,
 * but the local `rev-parse` still runs in the clone, so an
 * already-installed update stops being announced. A local head that
 * is not 1 to 64 lowercase hex characters is treated like a bad
 * remote head: `unknown`, and it never reaches git. Differing heads
 * are only `available` when the remote head is something the clone
 * does not already have ahead of its own HEAD (see `remoteIsAhead`):
 * a clone ahead of origin or diverged from it stays `current`, and
 * an ancestor check whose code is neither 0 nor 1 (a git killed by
 * its timeout, for instance) answers `unknown` with nothing
 * announced. Every runner call gets the caller's env minus every
 * `GIT_*` variable, plus `GIT_TERMINAL_PROMPT=0`. Never throws.
 */
export async function checkRemoteUpdate(o: {
  cloneDir: string;
  stateDir: string;
  env: NodeJS.ProcessEnv;
  now: number;
  run?: GitRunner;
}): Promise<RemoteUpdateResult> {
  if (!updateCheckEnabled(o.env)) {
    return { state: 'disabled' };
  }

  // Not a git clone: no runner call happens at all.
  if (!fs.existsSync(path.join(o.cloneDir, '.git'))) {
    return { state: 'unknown' };
  }

  const run = o.run ?? defaultGitRunner;
  const cacheFile = path.join(o.stateDir, 'update-check.json');
  const cache = readCache(cacheFile);
  let remoteHead: string | null = null;

  if (cache !== null && o.now - cache.checkedAt < CACHE_TTL_MS) {
    remoteHead = cache.remoteHead;
  } else {
    const url = readOriginUrl(o.cloneDir);
    if (url === null || !isSafeRemoteUrl(url)) {
      return { state: 'unknown' };
    }
    let res: { code: number | null; stdout: string };
    try {
      res = await run([...remoteGitFlags(url), 'ls-remote', url, 'HEAD'], {
        cwd: '/',
        timeoutMs: GIT_TIMEOUT_MS,
        env: gitEnv(o.env),
      });
    } catch {
      return { state: 'unknown' };
    }
    const sha = res.stdout.trim().split(/\s+/)[0] ?? '';
    if (res.code !== 0 || sha === '') {
      return { state: 'unknown' };
    }
    if (!isValidCommitId(sha)) {
      // Not a commit id: never handed to git, never cached.
      return { state: 'unknown' };
    }
    remoteHead = sha;
    try {
      fs.mkdirSync(o.stateDir, { recursive: true });
      secureWriteFileSync(
        cacheFile,
        JSON.stringify({ checkedAt: o.now, remoteHead: sha }) + '\n'
      );
    } catch {
      // a cache we cannot write is simply no cache next time
    }
  }

  try {
    const local = await run(['rev-parse', 'HEAD'], {
      cwd: o.cloneDir,
      timeoutMs: GIT_TIMEOUT_MS,
      env: gitEnv(o.env),
    });
    if (local.code !== 0) {
      return { state: 'unknown' };
    }
    const localHead = local.stdout.trim();
    if (!isValidCommitId(localHead)) {
      return { state: 'unknown' };
    }
    if (localHead === remoteHead) {
      return { state: 'current' };
    }
    const verdict = await remoteIsAhead(run, o.cloneDir, o.env, localHead, remoteHead);
    return { state: verdict };
  } catch {
    return { state: 'unknown' };
  }
}

/**
 * #66: the newest release the clone's origin tags, as `x.y.z`, or null.
 * One `git ls-remote --tags <url>` on the same rules as
 * `checkRemoteUpdate` (url read from `.git/config` without git, `https://`
 * or an absolute path only, cwd `/`, no `GIT_*` variables, 5 s timeout).
 * Only a tag named exactly `v<digits>.<digits>.<digits>` with an optional
 * `.<digits>` (1 to 6 digits each) counts; the `^{}` line of an annotated tag is the same tag, and
 * every other line the remote sends is ignored. Opted out, no clone
 * (no `.git/config` to read), offline, timed out or failing git: null.
 * F234: with a `stateDir`, a fresh `update-tag-check.json` (under 24 h, stamped
 * with the check's start time) answers with no git call, a success writes it 0600, a failure writes
 * nothing. Never throws.
 */
const RELEASE_TAG_LINE = /^([0-9a-f]{1,64})\s+refs\/tags\/v(\d{1,6}\.\d{1,6}\.\d{1,6}(?:\.\d{1,6})?)(\^\{\})?$/;

const TAG_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:\.\d{1,6})?$/;
const TAG_CACHE_MAX_BYTES = 4096;

/** F234: a newest release tag and the commit it names. */
export interface RemoteVersion {
  version: string;
  commit: string;
}

/**
 * F234: the tag-check cache, a sibling of `update-check.json` (its reader
 * and its tests pin that file to `{checkedAt, remoteHead}`). Anything not
 * exactly a fresh, past `checkedAt`, a validated version and a hex commit
 * is no cache.
 */
function readTagCache(file: string, now: number): RemoteVersion | null {
  try {
    if (fs.statSync(file).size > TAG_CACHE_MAX_BYTES) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.checkedAt === 'number' &&
      Number.isFinite(parsed.checkedAt) &&
      parsed.checkedAt <= now &&
      now - parsed.checkedAt < CACHE_TTL_MS &&
      typeof parsed.version === 'string' &&
      TAG_VERSION.test(parsed.version) &&
      typeof parsed.commit === 'string' &&
      isValidCommitId(parsed.commit)
    ) {
      return { version: parsed.version, commit: parsed.commit };
    }
  } catch {
    // unreadable or malformed cache counts as no cache
  }
  return null;
}

export async function checkRemoteVersion(o: {
  cloneDir: string;
  env: NodeJS.ProcessEnv;
  run?: GitRunner;
  /** Where the 24 h cache lives; without it nothing is cached or written. */
  stateDir?: string;
  now?: () => number;
}): Promise<RemoteVersion | null> {
  if (!updateCheckEnabled(o.env)) {
    return null;
  }
  const clock = o.now ?? Date.now;
  // checkedAt is the moment the check STARTED, so the 24 h timer of an open
  // snote (scheduled right after the start) finds the cache exactly 24 h old.
  const startedAt = clock();
  const cacheFile = o.stateDir === undefined ? null : path.join(o.stateDir, TAG_CACHE_FILE);
  if (cacheFile !== null) {
    const cached = readTagCache(cacheFile, startedAt);
    if (cached !== null) {
      return cached;
    }
  }
  const url = readOriginUrl(o.cloneDir);
  if (url === null || !isSafeRemoteUrl(url)) {
    return null;
  }
  try {
    const res = await (o.run ?? defaultGitRunner)([...remoteGitFlags(url), 'ls-remote', '--tags', url], {
      cwd: '/',
      timeoutMs: GIT_TIMEOUT_MS,
      env: gitEnv(o.env),
    });
    if (res.code !== 0) {
      return null;
    }
    let newest: RemoteVersion | null = null;
    for (const line of res.stdout.split('\n')) {
      const match = RELEASE_TAG_LINE.exec(line.trim());
      if (match === null) {
        continue;
      }
      const [, commit, version, peeled] = match;
      const cmp = newest === null ? 1 : compareVersions(version, newest.version);
      if (cmp > 0 || (cmp === 0 && peeled !== undefined)) {
        newest = { version, commit };
      }
    }
    if (newest !== null && cacheFile !== null) {
      try {
        fs.mkdirSync(o.stateDir as string, { recursive: true });
        secureWriteFileSync(
          cacheFile,
          JSON.stringify({ checkedAt: startedAt, version: newest.version, commit: newest.commit }) + '\n'
        );
      } catch {
        // a cache we cannot write is simply no cache next time
      }
    }
    return newest;
  } catch {
    return null;
  }
}
