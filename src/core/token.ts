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

/**
 * Logout — wipe the whole data dir, then re-create it empty.
 */
export async function logout(dir: string): Promise<void> {
  fs.rmSync(dir, { recursive: true, force: true });
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

/**
 * Move plain files from `root` into the account sub-folder (one-time migration
 * from a single-folder install).  `auth.json` is never moved.  Folders are
 * never touched.  Files whose target already exists in the account folder are
 * left in place.  Returns the sorted list of filenames that were moved.
 */
export function migrateLegacyData(root: string, email: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = entries.filter(e => e.isFile());
  const filesToMove = files.filter(e => e.name !== 'auth.json');
  if (filesToMove.length === 0) {
    return [];
  }
  const acctPath = accountDir(root, email);
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
