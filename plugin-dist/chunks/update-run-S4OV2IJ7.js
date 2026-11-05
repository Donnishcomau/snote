#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  checkLocalUpdate,
  checkRemoteUpdate,
  pluginCloneDir
} from "./chunk-C2I6QMXF.js";
import {
  publishUpdate
} from "./chunk-YEBQPWOH.js";
import "./chunk-SW33S73O.js";
import "./chunk-SRSFEH3H.js";

// src/core/update-run.ts
async function runUpdateChecks(o) {
  try {
    const cloneDir = pluginCloneDir(o.home);
    const local = checkLocalUpdate(o.version, cloneDir);
    if (local.state === "restart") {
      publishUpdate({ kind: "restart", available: local.available });
      return;
    }
    const remote = await checkRemoteUpdate({
      cloneDir,
      stateDir: o.stateDir,
      env: o.env,
      now: o.now ?? Date.now(),
      run: o.run
    });
    if (remote.state === "available") {
      publishUpdate({ kind: "available" });
    }
  } catch {
  }
}
export {
  runUpdateChecks
};
