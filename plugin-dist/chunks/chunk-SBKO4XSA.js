#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  INVISIBLE_FORMAT
} from "./chunk-C2S7DXWY.js";

// src/core/export-name.ts
import { homedir } from "node:os";
import { join } from "node:path";
var FILENAME_LENGTH = 40;
var UNSAFE_PATH = new RegExp(`\\p{Cc}|${INVISIBLE_FORMAT.source}`, "u");
var INVALID_CHARS = new RegExp(`[\\/\\\\?<>:*|"]|${UNSAFE_PATH.source}`, "gu");
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
  UNSAFE_PATH,
  exportFileName,
  documentsDir
};
