#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/endpoint-check.ts
var ENDPOINT_VARS = [
  "SNOTE_AUTH_BASE",
  "SNOTE_ACCOUNT_BASE",
  "SNOTE_BLOG_ORIGIN"
];
function isAllowed(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return url.hostname !== "";
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  }
  return false;
}
function checkEndpoints(env) {
  const warnings = [];
  const errors = [];
  for (const name of ENDPOINT_VARS) {
    const value = env[name];
    if (value !== void 0 && value !== "" && !isAllowed(value)) {
      errors.push(
        `error: ${name} must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])`
      );
    }
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    warnings.push(
      "warning: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checks for login and sync"
    );
  }
  return { warnings, errors };
}

// src/core/blog-status.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/core/sanitize.ts
var ESC = "\x1B";
var CSI_OR_OSC = new RegExp(
  ESC + "\\[[\\d?;]*[@-~]|" + ESC + "\\](?:[^" + ESC + "\x07]|" + ESC + "\\\\)*(?:\x07|" + ESC + "\\\\)",
  "g"
);
var ANY_ESC_PAIR = new RegExp(ESC + ".", "g");
var CONTROL_BYTES = new RegExp("[\\u0080-\\u009f\\x00-\\x08\\x0b-\\x1f\\x7f]", "g");
var VARIATION_SELECTORS = /[\uFE0F\uFE0E]/g;
var BIDI_INVISIBLES = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/g;
function sanitizeForTerminal(s) {
  return s.replace(CSI_OR_OSC, "").replace(ANY_ESC_PAIR, "").replace(CONTROL_BYTES, "").replace(BIDI_INVISIBLES, "").replace(VARIATION_SELECTORS, "");
}

// src/core/blog-status.ts
var BLOG_SENT_FILE = "blog-sent.json";
function blogStatusLine(record) {
  if (!record) {
    return null;
  }
  const rawUrl = record.url.startsWith("//") ? "https:" + record.url : record.url;
  const url = sanitizeForTerminal(rawUrl).replace(/[\n\t]/g, " ");
  return "Sent as draft \xB7 " + sanitizeForTerminal(record.sentAt).slice(0, 10) + " \xB7 " + url;
}
function loadBlogSend(dir, noteId) {
  const filePath = path.join(dir, BLOG_SENT_FILE);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    const record = data;
    if (!(noteId in record)) {
      return null;
    }
    const value = record[noteId];
    if (value === null || typeof value !== "object" || !("postId" in value) || !("url" in value) || !("sentAt" in value) || typeof value.postId !== "string" || typeof value.url !== "string" || typeof value.sentAt !== "string") {
      return null;
    }
    return {
      postId: value.postId,
      url: value.url,
      sentAt: value.sentAt
    };
  } catch {
    return null;
  }
}

export {
  sanitizeForTerminal,
  isAllowed,
  checkEndpoints,
  BLOG_SENT_FILE,
  blogStatusLine,
  loadBlogSend
};
