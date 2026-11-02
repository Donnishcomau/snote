#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  checkRemoteVersion,
  compareVersions,
  pluginCloneDir,
  updateCheckEnabled
} from "./chunk-GB4DFO2P.js";
import {
  markRunningNewest,
  publishBanner
} from "./chunk-KC7W25YK.js";
import "./chunk-ASSCDLWP.js";
import "./chunk-SRSFEH3H.js";

// src/core/update-watch.ts
var WATCH_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var realSchedule = (fn, ms) => {
  const timer = setInterval(fn, ms);
  timer.unref();
  return () => clearInterval(timer);
};
var stopActive = null;
function startUpdateWatch(o) {
  stopActive?.();
  stopActive = null;
  if (!updateCheckEnabled(o.env)) {
    return () => {
    };
  }
  const cloneDir = pluginCloneDir(o.home);
  const check = async () => {
    try {
      const newest = await checkRemoteVersion({
        cloneDir,
        env: o.env,
        run: o.run,
        stateDir: o.stateDir,
        now: o.now
      });
      if (newest !== null) {
        const newer = compareVersions(newest.version, o.version) > 0;
        markRunningNewest(!newer);
        if (newer) {
          publishBanner(o.version, newest.version);
        }
      }
    } catch {
    }
  };
  void check();
  const cancel = (o.schedule ?? realSchedule)(() => {
    void check();
  }, WATCH_INTERVAL_MS);
  const stop = () => {
    cancel();
    if (stopActive === stop) {
      stopActive = null;
    }
  };
  stopActive = stop;
  return stop;
}
export {
  WATCH_INTERVAL_MS,
  startUpdateWatch
};
