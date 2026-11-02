#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  boundedRequest
} from "./chunk-K2QSRYSP.js";
import {
  loadBlogConfig
} from "./chunk-PI7DHPPY.js";
import {
  BLOG_SENT_FILE,
  isAllowed,
  loadBlogSend
} from "./chunk-NSKMBNUK.js";
import "./chunk-35YNABTO.js";
import {
  secureMkdir,
  secureWriteFileSync
} from "./chunk-ASSCDLWP.js";
import "./chunk-SRSFEH3H.js";

// src/core/blog-client.ts
var DEFAULT_TIMEOUT_MS = 15e3;
function normalizeBlogUrl(url, origin) {
  const base = origin.replace(/\/+$/, "");
  if (url.startsWith("//")) {
    const scheme = /^(https?:)\/\//i.exec(base)?.[1] ?? "https:";
    return scheme + url;
  }
  if (url.startsWith("/")) {
    return base + url;
  }
  return url;
}
async function postBlogDraft({
  origin,
  token,
  title,
  markdown,
  timeoutMs
}) {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const url = `${trimmedOrigin}/api/agent/posts`;
  const response = await boundedRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, markdown, draft: true }),
      redirect: "error"
    },
    { timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS }
  );
  if (response.status === 201) {
    const body = response.json();
    return { id: body.id, url: normalizeBlogUrl(body.url, origin) };
  }
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (response.status === 422) {
    const body = response.json();
    throw new Error(body.error);
  }
  if (response.status === 429) {
    throw new Error("rate limited");
  }
  throw new Error(`HTTP ${response.status}`);
}

// src/core/blog-markdown.ts
var CHECKBOX_UNCHECKED = /^- \[ \] (.+)$/;
var CHECKBOX_CHECKED = /^- \[[xX]\] (.+)$/;
function checklistGlyphs(content) {
  const lines = content.split("\n");
  const result = lines.map((line) => {
    const uncheckedMatch = line.match(CHECKBOX_UNCHECKED);
    if (uncheckedMatch) {
      return "- \u2610 " + uncheckedMatch[1];
    }
    const checkedMatch = line.match(CHECKBOX_CHECKED);
    if (checkedMatch) {
      return "- \u2611 " + checkedMatch[1];
    }
    return line;
  });
  return result.join("\n");
}

// src/core/blog-draft.ts
function noteToBlogDraft(content) {
  const lines = content.split("\n");
  let titleLineIndex = -1;
  let titleLine = "";
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      titleLineIndex = i;
      titleLine = trimmed;
      break;
    }
  }
  if (titleLineIndex === -1) {
    throw new Error("title is required");
  }
  let title = titleLine;
  if (title.startsWith("# ")) {
    title = title.slice(2);
  }
  if (title.length > 200) {
    throw new Error("title is too long");
  }
  const remainingLines = lines.slice(titleLineIndex + 1);
  const markdownBody = remainingLines.join("\n");
  const markdown = checklistGlyphs(markdownBody);
  return { title, markdown };
}

// src/core/blog-sent.ts
import * as fs from "node:fs";
import * as path from "node:path";
function recordBlogSend(dir, noteId, { postId, url, sentAt }) {
  const filePath = path.join(dir, BLOG_SENT_FILE);
  let data = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  data[noteId] = { postId, url, sentAt };
  secureMkdir(dir);
  secureWriteFileSync(filePath, JSON.stringify(data));
}

// src/core/blog-send.ts
var inFlight = null;
function sendNoteToBlog(options) {
  if (inFlight) {
    return inFlight.noteId === options.noteId ? inFlight.done : Promise.reject(new Error("still sending to your blog"));
  }
  const slot = {
    noteId: options.noteId,
    done: sendOnce(options).finally(() => {
      if (inFlight === slot) inFlight = null;
    })
  };
  inFlight = slot;
  return slot.done;
}
async function sendOnce({
  dir,
  noteId,
  content,
  force,
  now
}) {
  const config = await loadBlogConfig(dir);
  if (!config) {
    throw new Error("blog is not configured");
  }
  if (!isAllowed(config.origin)) {
    throw new Error(
      "blog origin is not allowed: use https (http only for localhost)"
    );
  }
  const existing = loadBlogSend(dir, noteId);
  if (existing && !force) {
    return { already: true };
  }
  const { title, markdown } = noteToBlogDraft(content);
  const result = await postBlogDraft({
    origin: config.origin,
    token: config.token,
    title,
    markdown
  });
  recordBlogSend(dir, noteId, {
    postId: result.id,
    url: result.url,
    sentAt: now
  });
  return {
    url: result.url,
    sentAt: now,
    postId: result.id,
    already: false
  };
}
export {
  sendNoteToBlog
};
