#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/bounded-request.ts
var MAX_REPLY_BYTES = 1048576;
var BoundedError = class extends Error {
};
async function readCapped(res, maxBytes, host) {
  const tooLarge = () => new BoundedError(`reply from ${host} is larger than ${maxBytes} bytes`);
  if (Number(res.headers.get("content-length") ?? "0") > maxBytes) {
    void res.body?.cancel().catch(() => void 0);
    throw tooLarge();
  }
  if (res.body === null) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => void 0);
      throw tooLarge();
    }
    chunks.push(value);
  }
}
async function exchange(url, init, opts, signal, host) {
  const res = await (opts.fetch ?? fetch)(url, { ...init, signal, redirect: "error" });
  const bytes = await readCapped(res, opts.maxBytes ?? MAX_REPLY_BYTES, host);
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    bytes,
    get text() {
      return bytes.toString("utf8");
    },
    json() {
      try {
        return JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new BoundedError(`unexpected reply from ${host}`);
      }
    }
  };
}
async function boundedRequest(url, init, opts) {
  const host = new URL(url).host;
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BoundedError(`no answer from ${host} within ${Math.ceil(opts.timeoutMs / 1e3)} s`));
    }, opts.timeoutMs);
  });
  expired.catch(() => void 0);
  const work = exchange(url, init, opts, controller.signal, host);
  work.catch(() => void 0);
  try {
    return await Promise.race([work, expired]);
  } catch (e) {
    const err = e;
    if (err instanceof BoundedError) throw err;
    if (err.name === "AbortError") {
      throw new Error(`no answer from ${host} within ${Math.ceil(opts.timeoutMs / 1e3)} s`);
    }
    if (err.cause) throw new Error(`could not reach ${host}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export {
  boundedRequest
};
