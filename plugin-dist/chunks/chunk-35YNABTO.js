#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/blog-origin.ts
var DEFAULT_BLOG_ORIGIN = "https://skryf.art";
function blogOriginFromEnv(env) {
  const fromEnv = env.SNOTE_BLOG_ORIGIN;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BLOG_ORIGIN;
}

export {
  DEFAULT_BLOG_ORIGIN,
  blogOriginFromEnv
};
