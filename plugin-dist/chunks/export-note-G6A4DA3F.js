#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  UNSAFE_PATH,
  documentsDir,
  exportFileName
} from "./chunk-SBKO4XSA.js";
import "./chunk-C2S7DXWY.js";
import {
  secureExclusiveCreate
} from "./chunk-SW33S73O.js";
import "./chunk-SRSFEH3H.js";

// src/core/export-note.ts
import { homedir } from "node:os";
import { extname, isAbsolute, join } from "node:path";
function exportText(note) {
  const content = note.content ?? "";
  const tagLines = note.tags ?? [];
  if (tagLines.length === 0) return content;
  return `${content}

Tags:
  ${tagLines.join(", ")}`;
}
async function exportNote(note, dir, name = `${exportFileName(note.content ?? "")}.md`) {
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  const text = exportText(note);
  for (let n = 1; ; n++) {
    const path = join(dir, n === 1 ? name : `${base} ${n}${ext}`);
    try {
      secureExclusiveCreate(path, text, 438);
      return path;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}
function exportTarget(typed, suggested, docs, home) {
  const v = typed.trim() === "~" ? "~/" : typed.trim();
  if (UNSAFE_PATH.test(v)) return { error: "the path has a character snote cannot write" };
  const cut = v.lastIndexOf("/");
  const folder = v.slice(0, cut + 1);
  const raw = v.slice(cut + 1);
  if (raw === "." || raw === "..") return { error: "type a file name" };
  if (/^\.[^.]+$/.test(raw)) return { error: "type a file name" };
  const dir = folder.startsWith("~/") ? join(home, folder.slice(2)) : isAbsolute(folder) ? folder : join(docs, folder);
  return { dir, name: raw === "" ? suggested : extname(raw) === "" ? `${raw}.md` : raw };
}
async function exportTo(note, typed) {
  const t = exportTarget(typed, `${exportFileName(note.content ?? "")}.md`, documentsDir(), homedir());
  if ("error" in t) throw new Error(t.error);
  try {
    return await exportNote(note, t.dir, t.name);
  } catch (err) {
    const code = err.code;
    if (code === void 0) throw err;
    if (code === "ENOENT") throw new Error(`folder does not exist: ${t.dir}`);
    if (code === "ENOTDIR") throw new Error(`not a folder: ${t.dir}`);
    throw new Error(code === "ENAMETOOLONG" ? "the file name is too long" : "could not write the file");
  }
}
export {
  documentsDir,
  exportFileName,
  exportNote,
  exportTarget,
  exportText,
  exportTo
};
