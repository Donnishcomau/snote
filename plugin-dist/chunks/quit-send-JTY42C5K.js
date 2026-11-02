#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import "./chunk-SRSFEH3H.js";

// src/core/quit-send.ts
var QUIT_SEND_MS = 4e3;
var CATCH_UP = /* @__PURE__ */ Symbol.for("snote.noteCatchUpApplied");
function pendingOf(store) {
  return store.getState().simperium.pendingNotes;
}
function connected(store) {
  const online = globalThis.navigator?.onLine !== false;
  return online && store.getState().simperium.connectionStatus === "green";
}
function sendBeforeQuit(store, boundMs = QUIT_SEND_MS) {
  const count = () => {
    try {
      return Object.keys(pendingOf(store)).length;
    } catch {
      return 0;
    }
  };
  try {
    if (count() === 0) return Promise.resolve(0);
    const applied = store[CATCH_UP] === true;
    if (!applied || !connected(store)) return Promise.resolve(count());
    const buckets = (store.client ?? {}).buckets ?? [];
    const notes = buckets.find((b) => b?.name === "note");
    const pending = pendingOf(store);
    for (const id of Object.keys(pending)) {
      if (pending[id] !== "dirty") continue;
      try {
        void Promise.resolve(notes?.touch?.(id)).catch(() => {
        });
      } catch {
      }
    }
  } catch {
    return Promise.resolve(count());
  }
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      try {
        unsubscribe?.();
      } catch {
      }
      resolve(count());
    };
    const check = () => {
      try {
        if (count() === 0) setTimeout(finish, 0);
        else if (!connected(store)) finish();
      } catch {
        finish();
      }
    };
    const timer = setTimeout(finish, Math.max(0, boundMs));
    const poll = setInterval(check, 100);
    try {
      unsubscribe = store.subscribe(check);
    } catch {
    }
    check();
  });
}
function unsentLine(unsent) {
  if (unsent <= 0) return "";
  if (unsent === 1) {
    return "1 change not sent yet: it is kept on this computer and sent the next time snote starts";
  }
  return `${unsent} changes not sent yet: they are kept on this computer and sent the next time snote starts`;
}
export {
  QUIT_SEND_MS,
  sendBeforeQuit,
  unsentLine
};
