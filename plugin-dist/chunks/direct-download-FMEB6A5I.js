#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  SSH_KEYGEN,
  defaultProcRunner,
  signerPreflight,
  verifySignature
} from "./chunk-SKKL7M4H.js";
import {
  boundedRequest
} from "./chunk-AYQ5SVLD.js";
import "./chunk-Z3QLLVDS.js";
import {
  compareVersions
} from "./chunk-C347G3S2.js";
import {
  readRegularText,
  secureWriteFileSync
} from "./chunk-BQ6AXYOB.js";
import "./chunk-SRSFEH3H.js";

// src/core/direct-download.ts
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
var RELEASES = "https://github.com/Donnishcomau/snote/releases/";
var HOSTS = ["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"];
var MAX_REDIRECTS = 3;
var MAX_TARBALL = 8 * 1024 * 1024;
var MAX_TEXT = 4096;
var TOTAL_MS = 12e4;
var V = "[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}(?:\\.[0-9]{1,6})?";
var LIST = "ASSETS.SHA256SUMS";
var AGENT = "snote";
var no = (reason) => ({ ok: false, reason });
function hopAllowed(u) {
  return u.protocol === "https:" && u.username === "" && u.password === "" && u.port === "" && HOSTS.includes(u.hostname);
}
async function get(f, first, cap, deadline) {
  let url = new URL(first);
  if (url.hostname !== "github.com" || !url.pathname.startsWith("/Donnishcomau/snote/releases/")) return null;
  for (let hops = 0; ; hops++) {
    if (!hopAllowed(url)) return null;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const res = await boundedRequest(
      url.href,
      { method: "GET", credentials: "omit", headers: { "user-agent": AGENT } },
      { timeoutMs: left, maxBytes: cap, fetch: f, redirect: "manual" }
    );
    if (res.status >= 300 && res.status < 400) {
      const where = res.headers.get("location");
      if (where === null || hops >= MAX_REDIRECTS) return null;
      url = new URL(where, url);
      continue;
    }
    return res.status === 200 ? res.bytes : null;
  }
}
function parseAssets(buf) {
  const text = buf.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buf) || !text.endsWith("\n") || text.includes("\r")) return null;
  const lines = text.slice(0, -1).split("\n");
  const head = new RegExp(`^snote-assets (${V}) ([0-9a-f]{40})$`).exec(lines[0] ?? "");
  if (head === null || lines.length !== 3) return null;
  const version = head[1];
  const tar = new RegExp(`^([0-9a-f]{64})  snote-${version.replace(/\./g, "\\.")}\\.tar\\.gz$`).exec(lines[1] ?? "");
  if (tar === null || !/^[0-9a-f]{64}  snote-install$/.test(lines[2] ?? "")) return null;
  return { version, commit: head[2], tarSum: tar[1] };
}
async function signedList(o, deadline, newerOnly = true) {
  if (!new RegExp(`^${V}$`).test(o.runningVersion)) return "The running version is not a plain version number.";
  const sshKeygen = o.sshKeygenPath ?? SSH_KEYGEN;
  const pre = signerPreflight(sshKeygen, o.allowedSignersPath);
  if (pre !== null) return pre;
  const text = await get(o.fetch, `${RELEASES}latest/download/${LIST}`, MAX_TEXT, deadline);
  const sig = text === null ? null : await get(o.fetch, `${RELEASES}latest/download/${LIST}.sig`, MAX_TEXT, deadline);
  if (text === null || sig === null) return "The release list could not be downloaded.";
  const good = await verifySignature({ run: o.run ?? defaultProcRunner, sshKeygen, allowedSignersPath: o.allowedSignersPath, data: text, sig });
  if (!good) return "The release list signature did not verify.";
  const list = parseAssets(text);
  if (list === null) return "The release list is not in the expected form.";
  if (newerOnly && compareVersions(list.version, o.runningVersion) <= 0) return "The release is not newer than the running version.";
  return list;
}
async function downloadVerified(o) {
  try {
    const deadline = Date.now() + (o.timeoutMs ?? TOTAL_MS);
    const list = await signedList(o, deadline);
    if (typeof list === "string") return no(list);
    const bytes = await get(o.fetch, `${RELEASES}download/v${list.version}/snote-${list.version}.tar.gz`, MAX_TARBALL, deadline);
    if (bytes === null) return no("The release could not be downloaded.");
    if (createHash("sha256").update(bytes).digest("hex") !== list.tarSum) return no("The release does not match its signed hash.");
    return { ok: true, version: list.version, commit: list.commit, bytes };
  } catch {
    return no("The release could not be downloaded.");
  }
}
var VERSION_TEXT = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
var quit = (why) => ({ code: 1, line: `snote did not update: ${why}` });
var FAILED = "the update could not be downloaded and checked";
var small = (file, cap) => {
  const t = readRegularText(file) ?? "";
  return Buffer.byteLength(t) <= cap ? t : "";
};
function installedBuild(entry, home) {
  try {
    const appDir = path.join(fs.realpathSync(path.join(home, ".local", "share")), "snote-app", "app");
    const version = small(path.join(appDir, "VERSION"), 64).trim();
    return path.dirname(fs.realpathSync(entry ?? "")) === appDir && VERSION_TEXT.test(version) ? { appDir, version } : null;
  } catch {
    return null;
  }
}
function readSavedCheck(file, now) {
  try {
    const v = JSON.parse(small(file, 4096));
    const age = now - v.checkedAt;
    const ok = Object.keys(v).sort().join() === "checkedAt,version" && typeof v.checkedAt === "number" && age >= 0 && age < 864e5;
    return ok && typeof v.version === "string" && VERSION_TEXT.test(v.version) ? v.version : null;
  } catch {
    return null;
  }
}
async function directNewest(o) {
  const now = (o.now ?? Date.now)();
  const file = path.join(o.dataDir, "direct-release-check.json");
  const saved = readSavedCheck(file, now);
  if (saved !== null) return { version: saved };
  const opts = { runningVersion: o.build.version, allowedSignersPath: path.join(o.build.appDir, "allowed_signers") };
  const r = await (o.list ?? ((x) => signedList(x, Date.now() + 3e4, false).catch(() => "failed")))(opts);
  if (typeof r === "string" || !VERSION_TEXT.test(r.version)) return null;
  try {
    secureWriteFileSync(file, JSON.stringify({ checkedAt: now, version: r.version }) + "\n", { durable: false });
  } catch {
  }
  return { version: r.version };
}
function startDirectWatch(dataDir, home, watch) {
  const build = installedBuild(process.argv[1], home);
  if (build !== null) watch({ version: build.version, home, env: process.env, newest: () => directNewest({ dataDir, build }) });
}
async function startDirectHandOff(o) {
  const build = installedBuild(o.entry ?? process.argv[1], o.home);
  const helper = path.join(build?.appDir ?? "/", "update-helper");
  let found = false;
  try {
    found = build !== null && fs.lstatSync(helper).isFile() && fs.realpathSync(helper).startsWith(build.appDir + "/");
  } catch {
  }
  if (!found || build === null) return quit("the update script was not found");
  o.log?.("snote is downloading the update and checking its signature");
  const r = await (o.download ?? downloadVerified)({ runningVersion: build.version, allowedSignersPath: path.join(build.appDir, "allowed_signers") });
  if (!r.ok) return quit(FAILED);
  return new Promise((resolve) => {
    try {
      const child = o.run(helper, ["--from-stdin"], { stdio: ["pipe", "inherit", "inherit"], env: o.env, detached: true });
      child.once("error", () => resolve(quit(FAILED)));
      child.stdin?.once("error", () => resolve(quit(FAILED)));
      child.stdin?.end(Buffer.concat([Buffer.from(`${createHash("sha256").update(r.bytes).digest("hex")} ${r.version}
`), r.bytes]), (err) => {
        child.unref();
        resolve(err ? quit(FAILED) : { code: 0, line: "" });
      });
    } catch {
      resolve(quit(FAILED));
    }
  });
}
export {
  directNewest,
  downloadVerified,
  installedBuild,
  parseAssets,
  readSavedCheck,
  startDirectHandOff,
  startDirectWatch
};
