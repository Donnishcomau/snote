import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { acquireInstanceLock } from './instance-lock';
import { secureMkdir, secureOpenForRead, secureWriteFileSync } from './secure-fs';
import { accountDir, loadToken } from './token';

// #109 — the account id: each account folder holds `account.json`
// (`{"v":1,"email":...,"server":...}`, mode 0600). The identity is the pair
// (normalised email, server). Folder names are lossy, the id is not: a folder
// whose id differs is never read, written to or merged with.
// proof: test/cli/account-id.test.ts
// proof: test/core/secure-fs-symlink.test.ts
// proof: test/core/secure-fs-helpers.test.ts
// proof: test/core/r7-claims-294.test.ts
export const ACCOUNT_ID_FILE = 'account.json';

const DEFAULT_SERVER = 'default';
const MAX_ID_BYTES = 2048;
const MAX_TRIES = 4;

export interface AccountIdentity {
  email: string;
  server: string;
}

const normaliseEmail = (email: string): string => email.trim().normalize('NFC').toLowerCase();

export function identityOf(email: string, server?: string): AccountIdentity {
  return { email: normaliseEmail(email), server: server === undefined || server === '' ? DEFAULT_SERVER : server };
}

const hasControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
};

/**
 * The id recorded in `folder`, or null for "no id": a missing file, a
 * symlink (never followed), anything but a regular small file, non-JSON, any
 * version but 1, a wrong type, a control character, or an email that is not
 * in its own normal form.
 */
export function readAccountId(folder: string): AccountIdentity | null {
  const p = path.join(folder, ACCOUNT_ID_FILE);
  let raw: string;
  try {
    const st = fs.lstatSync(p);
    if (!st.isFile() || st.size > MAX_ID_BYTES) return null;
    const fd = secureOpenForRead(p);
    try {
      raw = fs.readFileSync(fd, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1 || typeof o.email !== 'string' || typeof o.server !== 'string') return null;
  if (o.email === '' || o.server === '' || hasControl(o.email) || hasControl(o.server)) return null;
  if (o.email !== normaliseEmail(o.email)) return null;
  return { email: o.email, server: o.server };
}

const sameIdentity = (a: AccountIdentity, b: AccountIdentity): boolean =>
  a.email === b.email && a.server === b.server;

/**
 * The folder this identity uses; creates and writes nothing. Start at
 * accountDir(root, email); a folder with no id (new, or from 0.2.8) or with
 * this id is it; a folder naming a different identity is skipped for
 * `<name>~<first 12 hex of sha256(email + "\n" + server)>`, repeated.
 */
export function resolveAccountDir(root: string, email: string, server?: string): string {
  const want = identityOf(email, server);
  const suffix = createHash('sha256').update(want.email + '\n' + want.server).digest('hex').slice(0, 12);
  let dir = accountDir(root, email);
  for (let i = 0; i < MAX_TRIES; i++) {
    const id = readAccountId(dir);
    if (id === null || sameIdentity(id, want)) return dir;
    dir = dir + '~' + suffix;
  }
  throw new Error('Could not choose a data folder for this account.');
}

function writeAccountId(folder: string, id: AccountIdentity): void {
  // The helper unlinks a planted .tmp, creates it exclusively and renames it
  // over account.json without following a link there.
  // proof: test/core/account-id-exclusive-tmp.test.ts
  // proof: test/core/secure-fs-symlink.test.ts
  secureWriteFileSync(
    path.join(folder, ACCOUNT_ID_FILE),
    JSON.stringify({ v: 1, email: id.email, server: id.server })
  );
}

/**
 * Sign-in, once the folder is chosen (resolveAccountDir) and the instance lock
 * is held: record the id when the folder has none (a new folder, or one from
 * 0.2.8; nothing in it is moved or removed). A folder that already names this
 * identity is left as it is; one that names another identity fails the
 * sign-in (the folder changed hands between the choice and the lock).
 */
export function recordAccountId(folder: string, email: string, server?: string): void {
  const want = identityOf(email, server);
  const id = readAccountId(folder);
  if (id === null) writeAccountId(folder, want);
  else if (!sameIdentity(id, want)) throw new Error('This data folder belongs to another account.');
}

/**
 * Start-up (before Root runs, after prepareDataDir): a 0.2.8 folder holds data
 * only while the root auth.json names its owner (every 0.2.8 sign-out sweeps
 * all folders), so record (saved email, saved server) in that folder now. Only
 * when the folder exists as a real folder, has no readable id, and no other
 * running snote holds its instance lock; writes only account.json; any
 * failure leaves the folder as it was (sign-in records the id then).
 */
export async function recordSavedAccountId(root: string): Promise<void> {
  const saved = await loadToken(root);
  if (!saved) return;
  let lock: { release: () => void };
  let folder: string;
  try {
    folder = resolveAccountDir(root, saved.email, saved.server);
    if (!fs.lstatSync(folder).isDirectory() || readAccountId(folder) !== null) return;
    lock = acquireInstanceLock(folder);
  } catch {
    return;
  }
  try {
    writeAccountId(folder, identityOf(saved.email, saved.server));
  } catch {
    // sign-in records it
  } finally {
    lock.release();
  }
}
