import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

/**
 * True when `dir` is a symlink (a missing path, or one under a file, is not: mkdir then fails as before).
 * proof: test/core/secure-mkdir-symlink.test.ts
 */
export function isSymlinkFolder(dir: string): boolean {
  try {
    return lstatSync(dir).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Create a directory (recursively). A symlink at `dir` is refused (throws)
 * before any mkdir, so nothing is created or changed through the link (#214).
 * Used as is for folders snote does not own (the bar plugin's folder, the
 * update-check state folder); `secureMkdir` adds the 0700 mode.
 * proof: test/core/secure-mkdir-symlink.test.ts
 */
export function ensureDir(dir: string, mode?: number): void {
  if (isSymlinkFolder(dir)) {
    throw new Error(`symlink: ${dir}`);
  }
  mkdirSync(dir, { recursive: true, mode });
}

/**
 * Create a directory (recursively) and force its mode to 0o700. A symlink at
 * `dir` is refused before any mkdir or chmod, so the link's target keeps its
 * mode. The recursive mkdir only applies `mode` to directories IT creates,
 * and even then masked by umask, so the chmod afterwards is what guarantees
 * an already-existing group/other-readable dir gets tightened on every call;
 * it runs on a descriptor opened with O_NOFOLLOW|O_DIRECTORY, so a link
 * planted between the check and the chmod is refused too.
 * proof: test/core/secure-mkdir-symlink.test.ts
 * proof: test/core/secure-mkdir-race.test.ts
 */
export function secureMkdir(dir: string): void {
  ensureDir(dir, 0o700);
  const fd = openSync(dir, constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
  fchmodSync(fd, 0o700);
  closeSync(fd);
}

/**
 * The one way snote writes a file (#194). The data goes to
 * `<path>.tmp`, created fresh with O_CREAT|O_EXCL|O_NOFOLLOW at mode 0o600
 * (a planted file or symlink at the temp name is unlinked first, never
 * written through), is fsynced, and is then renamed over `path`. A rename
 * replaces a symlink at `path` itself and never writes into its target.
 * Callers pass the FINAL path; they do not make a temp name or rename.
 * proof: test/core/secure-fs-symlink.test.ts
 */
export function secureWriteFileSync(path: string, data: string): void {
  const tmpPath = path + '.tmp';
  try {
    unlinkSync(tmpPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const flags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(tmpPath, flags, 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    try {
      unlinkSync(tmpPath);
    } catch {
      // already gone
    }
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(tmpPath, path);
  } catch (e) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // already gone
    }
    throw e;
  }
}

/**
 * Create `path` exclusively (O_CREAT|O_EXCL|O_NOFOLLOW) and write `data`:
 * it throws EEXIST when anything, a file or a symlink, dangling or not, is
 * already there, and never writes through a link. Mode 0o600 unless a mode
 * is given (a user-facing export asks for 0o666, which the umask narrows).
 * The whole text is written (a short write is continued) or the call throws
 * and removes the file it created, so no partly written file is left.
 * The instance lock and the note export use it.
 * proof: test/core/secure-fs-helpers.test.ts
 * proof: test/core/secure-fs-short-write.test.ts
 */
export function secureExclusiveCreate(path: string, data: string, mode: number = 0o600): void {
  const buf = Buffer.from(data, 'utf8');
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
  let complete = false;
  try {
    let off = 0;
    while (off < buf.length) {
      const n = writeSync(fd, buf, off, buf.length - off);
      if (!(n > 0)) {
        throw new Error(`short write: ${off} of ${buf.length} bytes written`);
      }
      off += n;
    }
    complete = true;
  } finally {
    try {
      closeSync(fd);
    } finally {
      if (!complete) {
        try {
          secureUnlink(path);
        } catch {
          // already gone
        }
      }
    }
  }
}

/**
 * Open `path` read-only without following a symlink (ELOOP for a link) and
 * return the descriptor; the caller reads and closes it. `nonBlock` keeps a
 * named pipe from hanging the open. There is no write-mode variant.
 * proof: test/core/secure-fs-helpers.test.ts
 */
export function secureOpenForRead(path: string, opts: { nonBlock?: boolean } = {}): number {
  return openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (opts.nonBlock === true ? constants.O_NONBLOCK : 0)
  );
}

/**
 * Rename `from` to `to` (an existing `to` is replaced; a symlink at `to` is
 * replaced, never followed). The one place a plain rename lives.
 * proof: test/core/secure-rename.test.ts
 */
export function secureRename(from: string, to: string): void {
  renameSync(from, to);
}

/**
 * Create a new, uniquely named folder from `prefix` (mkdtemp) with mode 0o700.
 * A symlink as the folder that will hold the new one is refused (throws), however
 * the prefix spells it (trailing separators, `.` components): the new folder would
 * otherwise be created under the link's target. Returns the folder's path.
 * proof: test/core/secure-mkdtemp.test.ts
 */
export function secureMkdtemp(prefix: string): string {
  // The holding folder (the 'x' makes a trailing '/' count), trailing '/' and '.' components dropped (`link/.` lstats as a plain folder).
  const parent = dirname(`${prefix}x`).replace(/(\/\.?)+$/, '');
  if (isSymlinkFolder(parent)) {
    throw new Error(`symlink: ${parent}`);
  }
  return mkdtempSync(prefix);
}

/**
 * Remove one file or symlink (a link is removed, never followed). Throws as
 * unlinkSync does (ENOENT for a missing path, EISDIR or EPERM for a folder);
 * callers decide which codes they ignore. The one place a plain unlink lives.
 * proof: test/structure/fs-delete-ban.test.ts
 */
export function secureUnlink(path: string): void {
  unlinkSync(path);
}

/**
 * Remove an empty folder (a symlink is refused, never followed). The one place
 * a plain rmdir lives.
 * proof: test/structure/fs-delete-ban.test.ts
 */
export function secureRmdir(path: string): void {
  rmdirSync(path);
}

/**
 * Remove a file or a whole folder tree, ignoring a missing path. A symlink at
 * `path` or inside the tree is removed as a link: its target is untouched.
 * The one place a recursive remove lives.
 * proof: test/structure/fs-delete-ban.test.ts
 */
export function secureRemoveTree(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
