#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  secureMkdir,
  secureWriteFileSync
} from "./chunk-SW33S73O.js";

// src/core/blog-config.ts
import * as fs from "node:fs";
import * as path from "node:path";
var BLOG_FILE = "blog.json";
async function saveBlogConfig(dir, { origin, token }) {
  if (!origin.startsWith("https://")) {
    throw new Error(
      `Invalid blog origin: must start with https://, got "${origin}"`
    );
  }
  if (!token || token.length === 0) {
    throw new Error("Blog token must be a non-empty string");
  }
  const filePath = path.join(dir, BLOG_FILE);
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const payload = { origin: trimmedOrigin, token };
  const data = JSON.stringify(payload);
  secureMkdir(dir);
  secureWriteFileSync(filePath, data);
}
async function loadBlogConfig(dir) {
  const filePath = path.join(dir, BLOG_FILE);
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || !("origin" in parsed) || !("token" in parsed) || typeof parsed.origin !== "string" || typeof parsed.token !== "string") {
    return null;
  }
  return {
    origin: parsed.origin,
    token: parsed.token
  };
}

export {
  saveBlogConfig,
  loadBlogConfig
};
