#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  documentsDir,
  exportFileName
} from "./chunk-PCM5WMUJ.js";
import {
  secureExclusiveCreate
} from "./chunk-KQUALZZJ.js";
import "./chunk-SRSFEH3H.js";

// src/core/export-note.ts
import { join } from "node:path";
function exportText(note) {
  const content = note.content ?? "";
  const tagLines = note.tags ?? [];
  if (tagLines.length === 0) return content;
  return `${content}

Tags:
  ${tagLines.join(", ")}`;
}
async function exportNote(note, dir) {
  const base = exportFileName(note.content ?? "");
  const text = exportText(note);
  for (let n = 1; ; n++) {
    const path = join(dir, n === 1 ? `${base}.md` : `${base} ${n}.md`);
    try {
      secureExclusiveCreate(path, text, 438);
      return path;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}
export {
  documentsDir,
  exportFileName,
  exportNote,
  exportText
};
