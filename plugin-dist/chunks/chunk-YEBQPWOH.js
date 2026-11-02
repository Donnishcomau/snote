#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/update-signal.ts
var current = null;
var listeners = /* @__PURE__ */ new Set();
function publishUpdate(u) {
  if (current !== null && current.kind === u.kind) {
    return;
  }
  current = u;
  for (const listener of listeners) {
    listener(u);
  }
}
function currentUpdate() {
  return current;
}
function onUpdate(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export {
  publishUpdate,
  currentUpdate,
  onUpdate
};
