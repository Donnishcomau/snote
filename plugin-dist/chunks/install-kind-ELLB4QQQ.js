#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  defaultGitRunner
} from "./chunk-JAW5LEGJ.js";
import "./chunk-KQUALZZJ.js";
import "./chunk-SRSFEH3H.js";

// src/core/install-kind.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
var HOMEPAGE = "https://github.com/donnishcomau/snote";
var CONTROL_BYTE = /[\u0000-\u001f\u007f-\u009f]/;
function under(file, dir) {
  return file.startsWith(dir.endsWith("/") ? dir : `${dir}/`);
}
function installKind(o) {
  try {
    if (!o.entry) return "unknown";
    const real = (o.realpath ?? fs.realpathSync)(o.entry);
    if (!path.isAbsolute(real) || CONTROL_BYTE.test(real) || real.split("/").includes("..")) {
      return "unknown";
    }
    const appDir = path.join((o.realpath ?? fs.realpathSync)(o.dataHome), "omarchy-snote-plugin", "app");
    if (under(real, appDir)) return "plugin";
    if (under(real, "/usr")) return "package";
    const hasGit = o.hasGit ?? ((d) => fs.existsSync(path.join(d, ".git")));
    let dir = path.dirname(real);
    for (let i = 0; i < 8 && dir !== path.dirname(dir); i++, dir = path.dirname(dir)) {
      if (hasGit(dir)) return "dev";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}
function runningInstallKind() {
  return installKind({
    entry: process.argv[1],
    dataHome: process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  });
}
function canOfferUpdate(kind) {
  return kind === "plugin";
}
function updateChecksFor(kind) {
  return kind !== "package";
}
function normaliseUrl(url) {
  return url.trim().toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "").replace(/\/+$/, "");
}
var ALLOWED_C_VALUES = /* @__PURE__ */ new Set([
  "credential.helper=",
  "core.hooksPath=/dev/null",
  "core.fsmonitor=false",
  "protocol.allow=never",
  "protocol.https.allow=always"
]);
var URL_SHAPE = /^[A-Za-z0-9:/._-]+$/;
function homepageGuard(inner = defaultGitRunner) {
  return async (args, opts) => {
    if (args.includes("ls-remote") && !isAllowedLsRemote(args)) {
      return { code: null, stdout: "" };
    }
    return inner(args, opts);
  };
}
function isAllowedLsRemote(args) {
  let i = 0;
  while (args[i] === "-c") {
    if (!ALLOWED_C_VALUES.has(args[i + 1] ?? "")) return false;
    i += 2;
  }
  if (args[i] !== "ls-remote") return false;
  const rest = args.slice(i + 1);
  let url;
  if (rest.length === 2 && rest[0] === "--tags") url = rest[1];
  else if (rest.length === 2 && rest[1] === "HEAD") url = rest[0];
  return url !== void 0 && URL_SHAPE.test(url) && normaliseUrl(url) === normaliseUrl(HOMEPAGE);
}
export {
  HOMEPAGE,
  canOfferUpdate,
  homepageGuard,
  installKind,
  runningInstallKind,
  updateChecksFor
};
