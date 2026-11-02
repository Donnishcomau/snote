#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/config.ts
var APP_ID = process.env.SNOTE_APP_ID ?? "chalk-bump-f49";
var API_KEY = process.env.SNOTE_API_KEY ?? "c8c2b86337154cdabc989b23e30c6bf4";
var ACCOUNT_BASE = process.env.SNOTE_ACCOUNT_BASE ?? "https://app.simplenote.com";
var AUTH_BASE = process.env.SNOTE_AUTH_BASE ?? "https://auth.simperium.com";

export {
  APP_ID,
  API_KEY,
  ACCOUNT_BASE,
  AUTH_BASE
};
