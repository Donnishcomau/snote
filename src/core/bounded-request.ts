/**
 * The one way snote makes an HTTP request to a server it does not control.
 *
 * - ONE deadline covers connect, headers AND the whole body read (an
 *   AbortController over the exchange; the timer is cleared only after the
 *   body is read);
 * - the body is read here, as a stream, and the read stops with an error as
 *   soon as it passes `maxBytes` (default 1 MiB); callers never read a
 *   Response body themselves (use the reply's `bytes`, `text` or `json()`);
 * - failures are human-readable: `no answer from <host> within <N> s`,
 *   `could not reach <host>`, `reply from <host> is larger than <N> bytes`,
 *   `unexpected reply from <host>` (not JSON; the server's bytes are not quoted).
 *
 * eslint.config.mjs forbids `fetch` and the raw http clients everywhere else
 * under src/ and vendor/; test/structure/bounded-request-only.test.ts proves it.
 * proof: test/core/bounded-request.test.ts
 */

/** Largest reply body read by default (bytes). */
export const MAX_REPLY_BYTES = 1048576;

export interface BoundedOpts {
  /** Milliseconds for the whole exchange: connect, headers and body. */
  timeoutMs: number;
  /** Most body bytes read before the request fails (default MAX_REPLY_BYTES). */
  maxBytes?: number;
  /** Replaces the global fetch (a test seam; the global is looked up at call time). */
  fetch?: typeof fetch;
}

export interface BoundedReply {
  status: number;
  ok: boolean;
  headers: Headers;
  /** The whole body, never longer than `maxBytes` bytes. */
  bytes: Buffer;
  /** `bytes` decoded as UTF-8. */
  readonly text: string;
  /** `text` parsed as JSON; a reply that is not JSON throws `unexpected reply from <host>` (no server bytes in the message). */
  json<T = unknown>(): T;
}

/** A failure this module already worded for the user. */
class BoundedError extends Error {}

async function readCapped(res: Response, maxBytes: number, host: string): Promise<Buffer> {
  const tooLarge = (): BoundedError =>
    new BoundedError(`reply from ${host} is larger than ${maxBytes} bytes`);
  if (Number(res.headers.get('content-length') ?? '0') > maxBytes) {
    void res.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (res.body === null) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
}

async function exchange(
  url: string,
  init: RequestInit,
  opts: BoundedOpts,
  signal: AbortSignal,
  host: string,
): Promise<BoundedReply> {
  const res = await (opts.fetch ?? fetch)(url, { ...init, signal });
  const bytes = await readCapped(res, opts.maxBytes ?? MAX_REPLY_BYTES, host);
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    bytes,
    get text() {
      return bytes.toString('utf8');
    },
    json<T = unknown>(): T {
      try {
        return JSON.parse(bytes.toString('utf8')) as T;
      } catch {
        throw new BoundedError(`unexpected reply from ${host}`);
      }
    },
  };
}

export async function boundedRequest(
  url: string,
  init: RequestInit,
  opts: BoundedOpts,
): Promise<BoundedReply> {
  const host = new URL(url).host;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BoundedError(`no answer from ${host} within ${Math.ceil(opts.timeoutMs / 1000)} s`));
    }, opts.timeoutMs);
  });
  expired.catch(() => undefined);
  const work = exchange(url, init, opts, controller.signal, host);
  work.catch(() => undefined);
  try {
    return await Promise.race([work, expired]);
  } catch (e) {
    const err = e as Error & { cause?: unknown };
    if (err instanceof BoundedError) throw err;
    if (err.name === 'AbortError') {
      throw new Error(`no answer from ${host} within ${Math.ceil(opts.timeoutMs / 1000)} s`);
    }
    if (err.cause) throw new Error(`could not reach ${host}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
