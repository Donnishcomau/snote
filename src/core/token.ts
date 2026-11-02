import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { secureMkdir, secureRemoveTree, secureRename, secureRmdir, secureUnlink, secureWriteFileSync } from './secure-fs';
import { sanitizeForTerminal } from './sanitize';

/**
 * Resolve the application data directory.
 * Reads the env at call time and creates nothing.
 */
export function defaultDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && xdg !== '') {
    return path.join(xdg, 'snote');
  }
  return path.join(os.homedir(), '.local', 'share', 'snote');
}

interface TokenPayload {
  email: string;
  token: string;
  server?: string;
}

/**
 * Save a token to `<dir>/auth.json` with mode 0o600.
 * The optional `server` records the server the token was issued for
 * (absent = production).
 * proof: test/core/token.test.ts
 */
export async function saveToken(
  dir: string,
  { email, token, server }: TokenPayload,
): Promise<void> {
  const filePath = path.join(dir, 'auth.json');
  // G2: every dir snote creates goes through secureMkdir (0700); a
  // plain mkdirSync left the data dir group/other-readable under umask 022.
  // proof: test/core/security-review-2.test.tsx
  // proof: test/structure/mkdir-scope.test.ts
  secureMkdir(dir);
  const payload: TokenPayload =
    server === undefined ? { email, token } : { email, token, server };
  const data = JSON.stringify(payload);
  secureWriteFileSync(filePath, data);
}

/**
 * Load the token from `<dir>/auth.json`.
 * Resolves `null` when the file is missing, not valid JSON, or missing keys.
 */
export async function loadToken(
  dir: string,
): Promise<{ email: string; token: string; server?: string } | null> {
  const filePath = path.join(dir, 'auth.json');
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('email' in parsed) ||
    !('token' in parsed) ||
    typeof (parsed as { email: unknown }).email !== 'string' ||
    typeof (parsed as { token: unknown }).token !== 'string'
  ) {
    return null;
  }
  const server = (parsed as { server?: unknown }).server;
  return {
    email: (parsed as { email: string }).email,
    token: (parsed as { token: string }).token,
    ...(typeof server === 'string' ? { server } : {}),
  };
}

// exactly the files snote itself writes — the per-folder set swept on
// logout. Root-only files (auth.json, blog.json, blog-sent.json) are handled
// separately; everything here may sit in the root (pre- installs) or in
// an account sub-folder. `.tmp` siblings are the atomic-write temp files of
// state.json, tombstones.json, ghosts-*.json and new-note.request.
const SNOTE_FILES = [
  'state.json',
  'tombstones.json',
  'ghosts-account.json',
  'ghosts-note.json',
  'ghosts-preferences.json',
  'ghosts-tag.json',
  'new-note.request',
  'unsynced.json',
  // #336a — the notes behind the record.
  'unsynced-notes.json',
  // #545 — an unloadable state.json kept aside at start-up.
  'state.json.corrupt',
  // the owed-ack record: logout sweeps it like the others.
  'sent-changes.json',
  // #109 - the account id: logout removes it; a forced sign-out keeps it.
  'account.json',
  // every name but the lock also lists its `.tmp` sibling (#247)
].flatMap((n) => [n, n + '.tmp']);

// #247: the temp files of the store files only the lock holder writes (not new-note.request.tmp, written by `snote --new`; not account.json.tmp, written by the account-id code, which logout cleans).
// Call only once the instance lock is held: a live save in another snote would lose its temp file.
export function sweepStaleTemps(dir: string): void {
  for (const n of SNOTE_FILES) if (n.endsWith('.tmp') && !/^(new|acc)/.test(n)) removeIfFile(path.join(dir, n));
}

function isSnoteFile(name: string): boolean {
  // the lock and its `.sweep` marker are one prefix
  return name.startsWith('instance.lock') || SNOTE_FILES.includes(name);
}

function removeIfFile(p: string): void {
  // Unlink, never `fs.rmSync`: this platform's `rm(2)` removes empty
  // directories too, so a plain rm would sweep unrelated empty folders.
  try {
    secureUnlink(p);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EISDIR') {
      throw e;
    }
  }
}

/**
 * Logout — remove only the files snote wrote, never anything else.
 * In `dir` itself: auth.json, blog.json, blog-sent.json and every file of
 * snote's set. In each direct sub-folder (symlinks never followed): every
 * file of snote's set and (#65) the editor's `snote-XXXXXX` folders in its
 * real `drafts` folder, then the sub-folder itself when that left it empty.
 * No deeper level is entered. Afterwards `dir` exists with mode 0700
 * (created when missing, as before).
 */
export async function logout(dir: string): Promise<void> {
  if (fs.existsSync(dir)) {
    for (const name of ['auth.json', 'auth.json.tmp', 'blog.json', 'blog.json.tmp', 'blog-sent.json', 'blog-sent.json.tmp']) {
      removeIfFile(path.join(dir, name));
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && isSnoteFile(entry.name)) {
        removeIfFile(path.join(dir, entry.name));
      }
    }
    for (const entry of entries) {
      // lstat-based entries only: a symlink stays a symlink here, and a
      // symlinked folder is never entered or removed.
      if (!entry.isDirectory()) {
        continue;
      }
      const sub = path.join(dir, entry.name);
      let removedAny = false;
      // #65: the account's editor drafts: inside a real `drafts` folder
      // (lstat), only the real folders snote's editor made (`snote-` plus the
      // 6 characters mkdtemp adds) go, then `drafts` itself when that left it
      // empty. Anything else in a `drafts` folder stays.
      const drafts = path.join(sub, 'drafts');
      if (fs.lstatSync(drafts, { throwIfNoEntry: false })?.isDirectory()) {
        for (const d of fs.readdirSync(drafts, { withFileTypes: true })) {
          if (d.isDirectory() && /^snote-[A-Za-z0-9]{6}$/.test(d.name)) {
            secureRemoveTree(path.join(drafts, d.name));
            removedAny = true;
          }
        }
        if (fs.readdirSync(drafts).length === 0) secureRmdir(drafts);
      }
      for (const child of fs.readdirSync(sub, { withFileTypes: true })) {
        if (child.isFile() && isSnoteFile(child.name)) {
          removeIfFile(path.join(sub, child.name));
          removedAny = true;
        }
      }
      // Only a folder *we* emptied goes away; one the user left empty stays.
      if (removedAny && fs.readdirSync(sub).length === 0) {
        secureRmdir(sub);
      }
    }
  }
  secureMkdir(dir);
}

/**
 * a server-forced sign-out (expired or revoked token) removes only the
 * credentials: `auth.json` and the blog token `blog.json`. Everything else in
 * `dir` and every account folder (unsynced.json, sent-changes.json, state,
 * tombstones, ghosts, drafts) stays byte for byte, so the changes sync when
 * the same account signs in again. The user's own logout is `logout`.
 */
export function forcedSignOut(dir: string): void {
  for (const name of ['auth.json', 'auth.json.tmp', 'blog.json', 'blog.json.tmp']) {
    removeIfFile(path.join(dir, name));
  }
}

/** The files of one account folder that mean "something is kept": more than the 2 bytes of an empty record. */
const KEPT_FILES = ['unsynced.json', 'sent-changes.json', 'tombstones.json'];

function realDraftCount(dir: string): number {
  try {
    if (!fs.lstatSync(path.join(dir, 'drafts')).isDirectory()) return 0; // #137: only a real drafts folder counts, as logout deletes it (proof: test/tui/logout-warning.test.tsx)
    return fs.readdirSync(path.join(dir, 'drafts'), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('snote-')).length;
  } catch {
    return 0;
  }
}

/**
 * does this account folder hold anything a forced sign-out keeps? A
 * regular `unsynced.json`, `sent-changes.json` or `tombstones.json` bigger than
 * 2 bytes, or a real `drafts/snote-*` folder. Reads no file.
 */
export function hasKept(dir: string): boolean {
  for (const name of KEPT_FILES) {
    const st = fs.lstatSync(path.join(dir, name), { throwIfNoEntry: false });
    if (st?.isFile() && st.size > 2) return true;
  }
  return realDraftCount(dir) > 0;
}

/**
 * how many changes this account folder keeps: the distinct note ids named
 * in `unsynced.json`, `sent-changes.json` and `tombstones.json` (a note in two
 * of them counts once) plus the real `drafts/snote-*` folders. Reads the
 * folder's own files (size capped at 1 MB each); a damaged file counts 0.
 */
export function keptCount(dir: string): number {
  const ids = new Set<string>();
  for (const name of KEPT_FILES) {
    const file = path.join(dir, name);
    const st = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!st?.isFile() || st.size > 1_000_000) continue;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
      for (const id of list) ids.add(String(id));
    } catch {
      /* damaged file: counts 0 */
    }
  }
  return ids.size + realDraftCount(dir);
}

/** The one plural rule for both notices (the forced sign-out notice and the logout warning). */
export function unsyncedChanges(n: number): string {
  return `${n} unsynced ${n === 1 ? 'change' : 'changes'}`;
}

/**
 * F237b: how many changes the folders of OTHER accounts keep: `keptCount` summed
 * over the direct sub-folders of `root` (real folders only) that `hasKept`, the
 * signed-in account's own folder `ownFolder` excluded. A folder that keeps
 * something counts at least 1 (a damaged or very large file counts 0 in
 * keptCount), and an unreadable root counts 1, so the warning never says 0
 * while logout would delete kept changes (proof: test/tui/logout-warning.test.tsx).
 */
export function keptElsewhereCount(root: string, ownFolder: string): number {
  const own = path.basename(ownFolder);
  let total = 0;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const sub = path.join(root, entry.name);
      if (entry.isDirectory() && entry.name !== own && hasKept(sub)) total += Math.max(1, keptCount(sub));
    }
  } catch {
    return Math.max(1, total);
  }
  return total;
}

/**
 * the server forced a sign-out. Something kept in this account (or in
 * another account's folder): remove the credentials only and return the login
 * notice (null when nothing is kept in this account). `dir` is the signed-in
 * account's own folder, chosen by the caller (resolveAccountDir). Nothing kept anywhere:
 * today's full logout sweep, so no cached notes stay on a signed-out machine.
 */
export function signOutByServer(root: string, dir: string): string | null {
  if (!hasKept(dir) && keptChangesNotice(root, dir) === null) {
    void logout(root);
    return null;
  }
  forcedSignOut(root);
  if (!hasKept(dir)) return null;
  const n = Math.max(1, keptCount(dir));
  return `Signed out by the server. ${unsyncedChanges(n)} ${n === 1 ? 'is' : 'are'} kept in ${sanitizeForTerminal(path.basename(dir))}. Log in again to sync them, or log out to remove them.`;
}

/**
 * the notice for kept changes of another account. Scans the direct
 * sub-folders of `root` (real folders only, a symlink is never followed) for
 * something kept (`hasKept`); it reads no file. The signed-in account's own folder (`ownFolder`, chosen by the caller with
 * #109's resolveAccountDir; this file never imports account-id) is skipped. Null when there is none; the folder
 * names pass through the terminal sanitiser.
 */
export function keptChangesNotice(root: string, ownFolder: string): string | null {
  const own = path.basename(ownFolder);
  const kept: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === own) continue;
    if (hasKept(path.join(root, entry.name))) kept.push(sanitizeForTerminal(entry.name));
  }
  return kept.length === 0
    ? null
    : `Unsynced changes from the previous account are kept on disk: ${kept.sort().join(', ')}`;
}

/**
 * Compute the account sub-folder name for a given root and email.
 * Lowercases, trims, replaces disallowed chars with `_`, returns `_` for
 * `''`, `.` or `..`.  Creates nothing.
 */
export function accountDir(root: string, email: string): string {
  const name = email.trim().toLowerCase().replace(/[^a-z0-9 @._+\-]/g, '_');
  const safe = name === '' || name === '.' || name === '..' ? '_' : name;
  return path.join(root, safe);
}

// exactly the files a pre- (single-folder) install left in the
// data-dir root — the state file, the tombstone file, and the ghost files of
// the four buckets that have file ghosts (note, tag, account, preferences,
// vendor/simplenote/state/simperium/middleware.ts), each with the `.tmp`
// sibling written by the atomic writer. Nothing else may ever be moved:
// `--data-dir` may point at a folder holding the user's own files, and the
// old rule ("move every plain file except the root-only ones") silently
// swept them into the account folder on the next start.
const LEGACY_ROOT_FILES = [
  'state.json',
  'tombstones.json',
  'ghosts-account.json',
  'ghosts-note.json',
  'ghosts-preferences.json',
  'ghosts-tag.json',
].flatMap((n) => [n, n + '.tmp']);

/**
 * Move snote's own legacy files from `root` into the account sub-folder
 * (one-time migration from a single-folder install).  Only the files of
 * LEGACY_ROOT_FILES are ever moved; every other file — `auth.json`, the blog
 * files, and anything the user put there — stays in the root, and folders are
 * never touched.  The account folder is created only when at least one legacy
 * file is actually present. Files whose target already exists in the account
 * folder are left in place.  Returns the sorted list of filenames that were
 * moved into the account folder (blog files moved back out to the root are
 * not included).
 *
 * blog-restart-fix: an earlier build of this migration had no such
 * exclusion and swept blog.json/blog-sent.json into the account folder on
 * the very next start, where nothing ever read them again — the saved blog
 * token and send records silently vanished. Any install a buggy run already
 * affected is repaired here too: a blog file found in the account folder is
 * moved back to the root, once, before the root is scanned.
 */
export function migrateLegacyData(root: string, email: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const acctPath = accountDir(root, email);
  for (const name of ['blog.json', 'blog-sent.json']) {
    const from = path.join(acctPath, name);
    const to = path.join(root, name);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      secureRename(from, to);
    }
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = entries.filter(e => e.isFile());
  const filesToMove = files.filter(e => LEGACY_ROOT_FILES.includes(e.name));
  if (filesToMove.length === 0) {
    return [];
  }
  secureMkdir(acctPath);
  const moved: string[] = [];
  for (const entry of filesToMove) {
    const from = path.join(root, entry.name);
    const to = path.join(acctPath, entry.name);
    if (!fs.existsSync(to)) {
      secureRename(from, to);
      moved.push(entry.name);
    }
  }
  return moved.sort();
}

/**
 * If a token is present in `root`, move legacy files into the account folder
 * for that token's email.  Returns the list of moved files.
 */
export async function prepareDataDir(root: string): Promise<string[]> {
  const saved = await loadToken(root);
  if (!saved) {
    return [];
  }
  return migrateLegacyData(root, saved.email);
}
