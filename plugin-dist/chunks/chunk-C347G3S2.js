#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/update-state.ts
import * as fs from "node:fs";
import * as path from "node:path";
var VERSION_RE = /^\d+(\.\d+)*$/;
function compareVersions(a, b) {
  const pa = a.trim().split(".");
  const pb = b.trim().split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? "0");
    const nb = Number(pb[i] ?? "0");
    if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}
function pluginCloneDir(home) {
  return path.join(
    home,
    ".config",
    "omarchy",
    "plugins",
    "io.github.donnishcomau.snote-simplenote"
  );
}
function checkLocalUpdate(running, cloneDir, read = (file) => fs.readFileSync(file, "utf8")) {
  let raw;
  try {
    raw = read(path.join(cloneDir, "plugin-dist", "VERSION"));
  } catch {
    return { state: "current" };
  }
  const available = raw.trim();
  if (!VERSION_RE.test(available)) {
    return { state: "current" };
  }
  if (compareVersions(available, running) > 0) {
    return { state: "restart", installed: running, available };
  }
  return { state: "current" };
}

export {
  compareVersions,
  pluginCloneDir,
  checkLocalUpdate
};
