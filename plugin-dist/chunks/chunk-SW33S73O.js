#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/secure-fs.ts
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { dirname } from "node:path";
function isSymlinkFolder(dir) {
  try {
    return lstatSync(dir).isSymbolicLink();
  } catch {
    return false;
  }
}
function ensureDir(dir, mode) {
  if (isSymlinkFolder(dir)) {
    throw new Error(`symlink: ${dir}`);
  }
  mkdirSync(dir, { recursive: true, mode });
}
function secureMkdir(dir) {
  ensureDir(dir, 448);
  const fd = openSync(dir, constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
  try {
    fchmodSync(fd, 448);
  } finally {
    closeSync(fd);
  }
}
function secureWriteFileSync(path, data) {
  const tmpPath = path + ".tmp";
  try {
    unlinkSync(tmpPath);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(tmpPath, flags, 384);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    try {
      unlinkSync(tmpPath);
    } catch {
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
    }
    throw e;
  }
}
var fileId = (st) => `${st.dev}:${st.ino}:${st.ctimeNs}`;
function secureExclusiveCreate(path, data, mode = 384) {
  const buf = Buffer.from(data, "utf8");
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
    return fileId(fstatSync(fd, { bigint: true }));
  } finally {
    try {
      if (!complete && sameInode(fd, lstatSync(path))) secureUnlink(path);
    } catch {
    } finally {
      closeSync(fd);
    }
  }
}
function sameInode(fd, st) {
  const own = fstatSync(fd);
  return own.dev === st.dev && own.ino === st.ino;
}
function secureOpenForRead(path, opts = {}) {
  return openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (opts.nonBlock === true ? constants.O_NONBLOCK : 0)
  );
}
function readRegularText(path) {
  let fd;
  try {
    fd = secureOpenForRead(path, { nonBlock: true });
    return fstatSync(fd).isFile() ? readFileSync(fd, "utf8") : null;
  } catch (e) {
    const code = e.code;
    return code === "ELOOP" || code === "ENXIO" ? null : "";
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function secureRename(from, to) {
  renameSync(from, to);
}
function secureMkdtemp(prefix) {
  const parent = dirname(`${prefix}x`).replace(/(\/\.?)+$/, "");
  if (isSymlinkFolder(parent)) {
    throw new Error(`symlink: ${parent}`);
  }
  return mkdtempSync(prefix);
}
function secureUnlink(path) {
  unlinkSync(path);
}
function secureRmdir(path) {
  rmdirSync(path);
}
function secureRemoveTree(path) {
  rmSync(path, { recursive: true, force: true });
}

export {
  isSymlinkFolder,
  ensureDir,
  secureMkdir,
  secureWriteFileSync,
  fileId,
  secureExclusiveCreate,
  secureOpenForRead,
  readRegularText,
  secureRename,
  secureMkdtemp,
  secureUnlink,
  secureRmdir,
  secureRemoveTree
};
