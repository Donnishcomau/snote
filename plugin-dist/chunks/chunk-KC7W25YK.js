#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/update-banner.ts
var current = null;
var dismissed = null;
var runningIsNewest = false;
var listeners = /* @__PURE__ */ new Set();
function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
    }
  }
}
function publishBanner(running, available) {
  if (current !== null && current.running === running && current.available === available) {
    return;
  }
  current = { running, available };
  if (dismissed === available) {
    return;
  }
  notify();
}
function currentBanner() {
  return current !== null && current.available !== dismissed ? current : null;
}
function markRunningNewest(value) {
  if (runningIsNewest === value) {
    return;
  }
  runningIsNewest = value;
  notify();
}
function runningIsNewestRelease() {
  return runningIsNewest;
}
function dismissBanner() {
  if (current === null) {
    return;
  }
  dismissed = current.available;
  notify();
}
function onBanner(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export {
  publishBanner,
  currentBanner,
  markRunningNewest,
  runningIsNewestRelease,
  dismissBanner,
  onBanner
};
