#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/export-name.ts
import { homedir } from "node:os";
import { join } from "node:path";
var FILENAME_LENGTH = 40;
var INVALID_CHARS = /[\/\\?<>:*|"\u0000-\u001f\u007f-\u009f\u200B\u200C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/g;
function exportFileName(content) {
  const raw = (content ?? "").split("\n").map((line) => line.trim()).find((line) => line !== "");
  if (raw === void 0) return "untitled";
  const cleaned = raw.replace(/^#\s+/, "").replace(INVALID_CHARS, "").slice(0, FILENAME_LENGTH);
  return cleaned === "" ? "untitled" : cleaned;
}
function documentsDir(env = process.env) {
  const xdg = env.XDG_DOCUMENTS_DIR;
  if (xdg && xdg.trim() !== "") return xdg;
  return join(homedir(), "Documents");
}

export {
  exportFileName,
  documentsDir
};
