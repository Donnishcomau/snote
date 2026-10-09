import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { secureMkdir } from './secure-fs';

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
 */
export async function saveToken(
  dir: string,
  { email, token, server }: TokenPayload,
): Promise<void> {
  const filePath = path.join(dir, 'auth.json');
  // T306 G2: every dir snote creates goes through secureMkdir (0700); a
  // plain mkdirSync left the data dir group/other-readable under umask 022.
  secureMkdir(dir);
  const payload: TokenPayload =
    server === undefined ? { email, token } : { email, token, server };
  const data = JSON.stringify(payload);
  fs.writeFileSync(filePath, data, { mode: 0o600 });
  // Ensure mode is correct even if the file already existed
  fs.chmodSync(filePath, 0o600);
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

// F102: exactly the files snote itself writes — the per-folder set swept on
// logout. Root-only files (auth.json, blog.json, blog-sent.json) are handled
// separately; everything here may sit in the root (pre-T156 installs) or in
// an account sub-folder. `.tmp` siblings are the atomic-write temp files of
// state.json, tombstones.json, ghosts-*.json and new-note.request.
const SNOTE_FILES = [
  'state.json',
  'state.json.tmp',
  'tombstones.json',
  'tombstones.json.tmp',
  'ghosts-account.json',
  'ghosts-account.json.tmp',
  'ghosts-note.json',
  'ghosts-note.json.tmp',
  'ghosts-preferences.json',
  'ghosts-preferences.json.tmp',
  'ghosts-tag.json',
  'ghosts-tag.json.tmp',
  'instance.lock',
  'new-note.request',
  'new-note.request.tmp',
  'unsynced.json',
  'unsynced.json.tmp',
];

function isSnoteFile(name: string): boolean {
  return SNOTE_FILES.includes(name);
}

function removeIfFile(p: string): void {
  // Unlink, never `fs.rmSync`: this platform's `rm(2)` removes empty
  // directories too, so a plain rm would sweep unrelated empty folders.
  try {
    fs.unlinkSync(p);
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
 * file of snote's set, then the sub-folder itself when that left it empty.
 * No deeper level is entered. Afterwards `dir` exists with mode 0700
 * (created when missing, as before).
 */
export async function logout(dir: string): Promise<void> {
  if (fs.existsSync(dir)) {
    for (const name of ['auth.json', 'blog.json', 'blog-sent.json']) {
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
      for (const child of fs.readdirSync(sub, { withFileTypes: true })) {
        if (child.isFile() && isSnoteFile(child.name)) {
          removeIfFile(path.join(sub, child.name));
          removedAny = true;
        }
      }
      // Only a folder *we* emptied goes away; one the user left empty stays.
      if (removedAny && fs.readdirSync(sub).length === 0) {
        fs.rmdirSync(sub);
      }
    }
  }
  secureMkdir(dir);
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

// F105: exactly the files a pre-T156 (single-folder) install left in the
// data-dir root — the state file, the tombstone file, and the ghost files of
// the four buckets that have file ghosts (note, tag, account, preferences,
// vendor/simplenote/state/simperium/middleware.ts), each with the `.tmp`
// sibling written by the atomic writer. Nothing else may ever be moved:
// `--data-dir` may point at a folder holding the user's own files, and the
// old rule ("move every plain file except the root-only ones") silently
// swept them into the account folder on the next start.
const LEGACY_ROOT_FILES = [
  'state.json',
  'state.json.tmp',
  'tombstones.json',
  'tombstones.json.tmp',
  'ghosts-account.json',
  'ghosts-account.json.tmp',
  'ghosts-note.json',
  'ghosts-note.json.tmp',
  'ghosts-preferences.json',
  'ghosts-preferences.json.tmp',
  'ghosts-tag.json',
  'ghosts-tag.json.tmp',
];

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
      fs.renameSync(from, to);
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
      fs.renameSync(from, to);
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
