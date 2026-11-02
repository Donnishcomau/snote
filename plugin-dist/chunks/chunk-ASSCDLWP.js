#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/secure-fs.ts
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
  fchmodSync(fd, 448);
  closeSync(fd);
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
function secureExclusiveCreate(path, data, mode = 384) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}
function secureOpenForRead(path, opts = {}) {
  return openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (opts.nonBlock === true ? constants.O_NONBLOCK : 0)
  );
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
  secureExclusiveCreate,
  secureOpenForRead,
  secureRename,
  secureMkdtemp,
  secureUnlink,
  secureRmdir,
  secureRemoveTree
};
