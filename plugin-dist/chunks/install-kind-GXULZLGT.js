#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  defaultGitRunner
} from "./chunk-Z3QLLVDS.js";
import "./chunk-C347G3S2.js";
import "./chunk-BQ6AXYOB.js";
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
var HOMEBREW_KEG = /\/Cellar\/snote\/[^/]+\//;
var PATH_KINDS = [
  { kind: "direct", holds: (real, _appDir, directDir) => under(real, directDir) },
  { kind: "plugin", holds: (real, appDir) => under(real, appDir) },
  { kind: "homebrew", holds: (real) => HOMEBREW_KEG.test(real) },
  { kind: "package", holds: (real) => under(real, "/usr") }
];
var NO_UPDATE_CHECK = ["package", "homebrew"];
function installKind(o) {
  try {
    if (!o.entry) return "unknown";
    const real = (o.realpath ?? fs.realpathSync)(o.entry);
    if (!path.isAbsolute(real) || CONTROL_BYTE.test(real) || real.split("/").includes("..")) {
      return "unknown";
    }
    const appDir = path.join((o.realpath ?? fs.realpathSync)(o.dataHome), "omarchy-snote-plugin", "app");
    const directDir = o.home === void 0 ? "\0" : directAppDir(o.home, o.realpath ?? fs.realpathSync);
    for (const rule of PATH_KINDS) if (rule.holds(real, appDir, directDir)) return rule.kind;
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
function directAppDir(home, realpath) {
  try {
    return path.join(realpath(path.join(home, ".local", "share")), "snote-app", "app");
  } catch {
    return "\0";
  }
}
function runningInstallKind() {
  return installKind({
    entry: process.argv[1],
    dataHome: process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
    home: os.homedir()
  });
}
function updateStateDir(kind, pluginDir, dataDir) {
  return kind === "plugin" ? pluginDir : dataDir;
}
function canOfferUpdate(kind) {
  return kind === "plugin" || kind === "direct";
}
function updateChecksFor(kind) {
  return !NO_UPDATE_CHECK.includes(kind);
}
function installReport(kind, pluginAppPresent) {
  const lines = [kind === "homebrew" ? "install: homebrew (updates come from brew upgrade snote)" : `install: ${kind}`];
  if (pluginAppPresent && kind !== "plugin") lines.push("install: plugin too (update the Omarchy bar plugin with omarchy plugin update)");
  return lines.join("\n");
}
function runningInstallReport() {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return installReport(runningInstallKind(), fs.existsSync(path.join(dataHome, "omarchy-snote-plugin", "app")));
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
  installReport,
  runningInstallKind,
  runningInstallReport,
  updateChecksFor,
  updateStateDir
};
