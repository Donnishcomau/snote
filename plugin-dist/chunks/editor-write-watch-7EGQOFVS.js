#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import "./chunk-SRSFEH3H.js";

// src/core/editor-write-watch.ts
import { watch } from "node:fs";
import { basename, dirname } from "node:path";
var WRITE_SETTLE_MS = 150;
function watchDraftWrites(file, initial, read, onWrite, onSettled, onSame) {
  let last = initial;
  let timer;
  const name = basename(file);
  const settle = () => {
    timer = void 0;
    const got = read(file);
    if (got !== null && "text" in got && got.text.trim() !== "") {
      if (got.text === last) {
        try {
          onSame?.(got.text);
        } catch {
        }
      } else {
        last = got.text;
        try {
          onWrite(got.text);
        } catch {
        }
      }
    }
    onSettled?.();
  };
  const settleNow = () => {
    if (timer === void 0) return;
    clearTimeout(timer);
    settle();
  };
  live.add(settleNow);
  const watcher = watch(dirname(file), (_event, changed) => {
    if (changed !== null && changed !== name) return;
    if (timer !== void 0) clearTimeout(timer);
    timer = setTimeout(settle, WRITE_SETTLE_MS);
  });
  watcher.on("error", () => watcher.close());
  watcher.unref();
  timer = setTimeout(settle, WRITE_SETTLE_MS);
  return () => {
    live.delete(settleNow);
    if (timer !== void 0) clearTimeout(timer);
    watcher.close();
    return last;
  };
}
var live = /* @__PURE__ */ new Set();
function settleDraftWrites() {
  for (const settleNow of [...live]) {
    try {
      settleNow();
    } catch {
    }
  }
}
export {
  WRITE_SETTLE_MS,
  settleDraftWrites,
  watchDraftWrites
};
