#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  compareVersions
} from "./chunk-C347G3S2.js";
import {
  ensureDir,
  secureWriteFileSync
} from "./chunk-BQ6AXYOB.js";

// src/core/update-check.ts
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
function updateCheckEnabled(env) {
  const v = env.SNOTE_UPDATE_CHECK;
  return !(v === "off" || v === "0");
}
var GIT_TIMEOUT_MS = 5e3;
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var TAG_CACHE_FILE = "update-tag-check.json";
function gitEnv(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("GIT_")) {
      out[key] = value;
    }
  }
  out.GIT_TERMINAL_PROMPT = "0";
  out.GIT_CONFIG_NOSYSTEM = "1";
  return out;
}
var REMOTE_GIT_FLAGS = [
  "-c",
  "credential.helper=",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "protocol.allow=never",
  "-c",
  "protocol.https.allow=always"
];
function remoteGitFlags(url) {
  return url.startsWith("/") ? [...REMOTE_GIT_FLAGS, "-c", "protocol.file.allow=always"] : REMOTE_GIT_FLAGS;
}
function readOriginUrl(cloneDir) {
  let text;
  try {
    text = fs.readFileSync(path.join(cloneDir, ".git", "config"), "utf8");
  } catch {
    return null;
  }
  let inOrigin = false;
  for (const line of text.split("\n")) {
    const header = /^\s*\[([^\]]*)\]\s*$/.exec(line);
    if (header) {
      const name = header[1].split(/\s+/g).map((part) => part.trim().replace(/^"(.*)"$/s, "$1")).join(" ");
      inOrigin = name === "remote origin";
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
function isSafeRemoteUrl(url) {
  return url.startsWith("https://") || url.startsWith("/");
}
var defaultGitRunner = (args, opts) => new Promise((resolve) => {
  const child = execFile(
    "git",
    args,
    { cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: 1048576, env: opts.env },
    (error, stdout) => {
      if (!error) {
        resolve({ code: 0, stdout: String(stdout ?? "") });
        return;
      }
      const err = error;
      if (err.killed === true || err.signal != null) {
        resolve({ code: null, stdout: String(stdout ?? "") });
      } else if (typeof err.code === "number") {
        resolve({ code: err.code, stdout: String(stdout ?? "") });
      } else {
        resolve({ code: null, stdout: String(stdout ?? "") });
      }
    }
  );
  if (!child) {
    resolve({ code: null, stdout: "" });
  }
});
function runInClone(run, cloneDir, env, args) {
  return run(args, {
    cwd: cloneDir,
    timeoutMs: GIT_TIMEOUT_MS,
    env: gitEnv(env)
  });
}
async function remoteIsAhead(run, cloneDir, env, localHead, remoteHead) {
  const hasRemote = await runInClone(run, cloneDir, env, [
    ...REMOTE_GIT_FLAGS,
    // MUST 6 on the in-clone calls too
    "cat-file",
    "-e",
    `${remoteHead}^{commit}`
  ]);
  if (hasRemote.code === null) {
    return "unknown";
  }
  if (hasRemote.code !== 0) {
    return "available";
  }
  const ancestor = await runInClone(run, cloneDir, env, [
    ...REMOTE_GIT_FLAGS,
    "merge-base",
    "--is-ancestor",
    localHead,
    remoteHead
  ]);
  if (ancestor.code === 0) {
    return "available";
  }
  if (ancestor.code === 1) {
    return "current";
  }
  return "unknown";
}
function isValidCommitId(head) {
  return /^[0-9a-f]{1,64}$/.test(head);
}
function readCache(file) {
  try {
    if (fs.statSync(file).size > TAG_CACHE_MAX_BYTES) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed.checkedAt === "number" && typeof parsed.remoteHead === "string" && parsed.remoteHead.length > 0 && isValidCommitId(parsed.remoteHead)) {
      return { checkedAt: parsed.checkedAt, remoteHead: parsed.remoteHead };
    }
  } catch {
  }
  return null;
}
async function checkRemoteUpdate(o) {
  if (!updateCheckEnabled(o.env)) {
    return { state: "disabled" };
  }
  if (!fs.existsSync(path.join(o.cloneDir, ".git"))) {
    return { state: "unknown" };
  }
  const run = o.run ?? defaultGitRunner;
  const cacheFile = path.join(o.stateDir, "update-check.json");
  const cache = readCache(cacheFile);
  let remoteHead = null;
  if (cache !== null && o.now - cache.checkedAt < CACHE_TTL_MS) {
    remoteHead = cache.remoteHead;
  } else {
    const url = readOriginUrl(o.cloneDir);
    if (url === null || !isSafeRemoteUrl(url)) {
      return { state: "unknown" };
    }
    let res;
    try {
      res = await run([...remoteGitFlags(url), "ls-remote", url, "HEAD"], {
        cwd: "/",
        timeoutMs: GIT_TIMEOUT_MS,
        env: gitEnv(o.env)
      });
    } catch {
      return { state: "unknown" };
    }
    const sha = res.stdout.trim().split(/\s+/)[0] ?? "";
    if (res.code !== 0 || sha === "") {
      return { state: "unknown" };
    }
    if (!isValidCommitId(sha)) {
      return { state: "unknown" };
    }
    remoteHead = sha;
    try {
      ensureDir(o.stateDir);
      secureWriteFileSync(
        cacheFile,
        JSON.stringify({ checkedAt: o.now, remoteHead: sha }) + "\n",
        { durable: false }
        // #682: rebuilt by the next check (HEAD)
      );
    } catch {
    }
  }
  try {
    const local = await runInClone(run, o.cloneDir, o.env, [...REMOTE_GIT_FLAGS, "rev-parse", "HEAD"]);
    if (local.code !== 0) {
      return { state: "unknown" };
    }
    const localHead = local.stdout.trim();
    if (!isValidCommitId(localHead)) {
      return { state: "unknown" };
    }
    if (localHead === remoteHead) {
      return { state: "current" };
    }
    const verdict = await remoteIsAhead(run, o.cloneDir, o.env, localHead, remoteHead);
    return { state: verdict };
  } catch {
    return { state: "unknown" };
  }
}
var RELEASE_TAG_LINE = /^([0-9a-f]{1,64})\s+refs\/tags\/v(\d{1,6}\.\d{1,6}\.\d{1,6}(?:\.\d{1,6})?)(\^\{\})?$/;
var TAG_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:\.\d{1,6})?$/;
var TAG_CACHE_MAX_BYTES = 4096;
function readTagCache(file, now) {
  try {
    if (fs.statSync(file).size > TAG_CACHE_MAX_BYTES) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed !== null && typeof parsed === "object" && typeof parsed.checkedAt === "number" && Number.isFinite(parsed.checkedAt) && parsed.checkedAt <= now && now - parsed.checkedAt < CACHE_TTL_MS && typeof parsed.version === "string" && TAG_VERSION.test(parsed.version) && typeof parsed.commit === "string" && isValidCommitId(parsed.commit)) {
      return { version: parsed.version, commit: parsed.commit };
    }
  } catch {
  }
  return null;
}
async function checkRemoteVersion(o) {
  if (!updateCheckEnabled(o.env)) {
    return null;
  }
  const clock = o.now ?? Date.now;
  const startedAt = clock();
  const cacheFile = o.stateDir === void 0 ? null : path.join(o.stateDir, TAG_CACHE_FILE);
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
    const res = await (o.run ?? defaultGitRunner)([...remoteGitFlags(url), "ls-remote", "--tags", url], {
      cwd: "/",
      timeoutMs: GIT_TIMEOUT_MS,
      env: gitEnv(o.env)
    });
    if (res.code !== 0) {
      return null;
    }
    let newest = null;
    for (const line of res.stdout.split("\n")) {
      const match = RELEASE_TAG_LINE.exec(line.trim());
      if (match === null) {
        continue;
      }
      const [, commit, version, peeled] = match;
      const cmp = newest === null ? 1 : compareVersions(version, newest.version);
      if (cmp > 0 || cmp === 0 && peeled !== void 0) {
        newest = { version, commit };
      }
    }
    if (newest !== null && cacheFile !== null) {
      try {
        ensureDir(o.stateDir);
        secureWriteFileSync(
          cacheFile,
          JSON.stringify({ checkedAt: startedAt, version: newest.version, commit: newest.commit }) + "\n",
          { durable: false }
          // #682: rebuilt by the next check (tags)
        );
      } catch {
      }
    }
    return newest;
  } catch {
    return null;
  }
}

export {
  updateCheckEnabled,
  gitEnv,
  REMOTE_GIT_FLAGS,
  defaultGitRunner,
  checkRemoteUpdate,
  checkRemoteVersion
};
