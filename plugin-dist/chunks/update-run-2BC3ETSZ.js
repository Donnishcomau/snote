#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  publishUpdate
} from "./chunk-YEBQPWOH.js";
import {
  checkRemoteUpdate
} from "./chunk-Z3QLLVDS.js";
import {
  checkLocalUpdate,
  pluginCloneDir
} from "./chunk-C347G3S2.js";
import "./chunk-BQ6AXYOB.js";
import "./chunk-SRSFEH3H.js";

// src/core/update-run.ts
async function runUpdateChecks(o) {
  try {
    const cloneDir = pluginCloneDir(o.home);
    const local = checkLocalUpdate(o.version, cloneDir);
    if (local.state === "restart") {
      publishUpdate(o.offPlugin ? { kind: "available", offPlugin: true } : { kind: "restart", available: local.available });
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
      publishUpdate(o.offPlugin ? { kind: "available", offPlugin: true } : { kind: "available" });
    }
  } catch {
  }
}
export {
  runUpdateChecks
};
