#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  boundedRequest
} from "./chunk-3X366BHY.js";
import {
  ACCOUNT_BASE,
  API_KEY,
  APP_ID,
  AUTH_BASE
} from "./chunk-S4I2QST2.js";
import "./chunk-SRSFEH3H.js";

// src/core/auth.ts
var DEFAULT_TIMEOUT_MS = 15e3;
function summarizeErrorText(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}
function fetchBounded(url, init, timeoutMs) {
  return boundedRequest(url, init, { timeoutMs });
}
async function requestLoginCode(email, opts) {
  const accountUrl = opts?.accountBase ?? ACCOUNT_BASE;
  const url = `${accountUrl}/account/request-login`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await fetchBounded(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: email.trim().toLowerCase(),
        request_source: "electron"
      })
    },
    timeoutMs
  );
  if (!res.ok) {
    throw new Error(`${res.status} ${summarizeErrorText(res.text)}`);
  }
}
async function completeLogin(email, code, opts) {
  const accountUrl = opts?.accountBase ?? ACCOUNT_BASE;
  const url = `${accountUrl}/account/complete-login`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await fetchBounded(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: email.trim().toLowerCase(),
        auth_code: code.trim().toUpperCase()
      })
    },
    timeoutMs
  );
  if (!res.ok) {
    let message = `completeLogin failed: ${res.status}`;
    try {
      const errBody = res.json();
      if (errBody.message) message = String(errBody.message);
    } catch {
    }
    throw new Error(`${res.status} ${summarizeErrorText(message)}`);
  }
  const json = res.json();
  return json.sync_token;
}
async function loginWithPassword(email, password, opts) {
  const authUrl = opts?.authBase ?? AUTH_BASE;
  const appId = opts?.appId ?? APP_ID;
  const apiKey = opts?.apiKey ?? API_KEY;
  const url = `${authUrl}/1/${appId}/authorize/`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await fetchBounded(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Simperium-API-Key": apiKey
      },
      body: JSON.stringify({
        username: email.trim().toLowerCase(),
        password
      })
    },
    timeoutMs
  );
  if (!res.ok) {
    const text = res.text;
    throw new Error(`${res.status} ${summarizeErrorText(text)}`);
  }
  const json = res.json();
  return json.access_token;
}
export {
  completeLogin,
  loginWithPassword,
  requestLoginCode
};
