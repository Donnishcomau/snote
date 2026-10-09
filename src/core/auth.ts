/**
 * Authentication helpers for the headless client.
 *
 * All three functions perform a single HTTP POST and return the JSON body
 * (or throw on non-2xx).  The functions accept explicit URL base so that
 * tests can pass in the fake-server endpoint.
 */

import { AUTH_BASE, ACCOUNT_BASE, APP_ID, API_KEY } from './config';

/**
 * Options object for auth functions.
 */
export interface AuthOpts {
  accountBase?: string;
  authBase?: string;
  appId?: string;
  apiKey?: string;
  /** Milliseconds before a call gives up (default 15000). */
  timeoutMs?: number;
}

/** Fallback give-up time for a single auth request (ms). */
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Bound a server-supplied error text to a single readable line:
 * fold every run of whitespace into one space, trim, and cut to
 * the first 200 characters (no ellipsis).
 */
function summarizeErrorText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * POST with a deadline and human-readable failures.
 *
 * - gives up after `timeoutMs` with `no answer from <host> within <N> s`
 *   (`<host>` = URL host with port, `<N>` = whole seconds, rounded up);
 * - a connection that never opens (nothing listening, DNS) rejects with
 *   `could not reach <host>` instead of the raw `fetch failed`;
 * - every other failure passes through unchanged, so HTTP error replies
 *   keep the caller's formatting.
 */
async function fetchBounded(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const host = new URL(url).host;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (e) {
    const err = e as Error & { cause?: unknown };
    if (err.name === 'AbortError') {
      throw new Error(`no answer from ${host} within ${Math.ceil(timeoutMs / 1000)} s`);
    }
    if (err.cause) {
      throw new Error(`could not reach ${host}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requests a login code for *email* to be sent via email.
 *
 * POSTs `{ username: email, request_source: "electron" }` to
 * `POST /account/request-login` under the account base with a JSON
 * content type.
 *
 * @param email   - The user's email address.
 * @param opts    - Optional overrides (tests use fake server).
 * @throws Error on non-2xx response.
 */
export async function requestLoginCode(
  email: string,
  opts?: AuthOpts,
): Promise<void> {
  const accountUrl = opts?.accountBase ?? ACCOUNT_BASE;
  const url = `${accountUrl}/account/request-login`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const res = await fetchBounded(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: email.trim().toLowerCase(),
        request_source: 'electron',
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    throw new Error(`${res.status} ${summarizeErrorText(await res.text())}`);
  }
}

/**
 * Completes login using the code received via email.
 *
 * POSTs `{ username, auth_code }` to `POST /account/complete-login` and
 * returns the `sync_token` on success.
 *
 * @param email   - The user's email address.
 * @param code    - The auth code received via email.
 * @param opts    - Optional overrides (tests use fake server).
 * @throws Error on non-2xx response.
 */
export async function completeLogin(
  email: string,
  code: string,
  opts?: AuthOpts,
): Promise<string> {
  const accountUrl = opts?.accountBase ?? ACCOUNT_BASE;
  const url = `${accountUrl}/account/complete-login`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const res = await fetchBounded(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: email.trim().toLowerCase(),
        auth_code: code.trim().toUpperCase(),
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    let message = `completeLogin failed: ${res.status}`;
    try {
      const errBody = (await res.json()) as Record<string, unknown>;
      if (errBody.message) message = String(errBody.message);
    } catch { /* ignore */ }
    throw new Error(`${res.status} ${summarizeErrorText(message)}`);
  }

  const json = (await res.json()) as { sync_token?: string };
  return json.sync_token!;
}

/**
 * Authenticates with username / password.
 *
 * POSTs `{ username, password }` to `POST /1/<APP_ID>/authorize/` under
 * the auth base with the API_KEY header.  Returns the access_token on success.
 *
 * @param email     - The user's login email.
 * @param password  - The user's password (kept as-is, case-sensitive).
 * @param opts      - Optional overrides (tests use fake server).
 * @throws Error on non-2xx response.
 */
export async function loginWithPassword(
  email: string,
  password: string,
  opts?: AuthOpts,
): Promise<string> {
  const authUrl = opts?.authBase ?? AUTH_BASE;
  const appId = opts?.appId ?? APP_ID;
  const apiKey = opts?.apiKey ?? API_KEY;
  const url = `${authUrl}/1/${appId}/authorize/`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const res = await fetchBounded(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simperium-API-Key': apiKey,
      },
      body: JSON.stringify({
        username: email.trim().toLowerCase(),
        password,
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${summarizeErrorText(text)}`);
  }

  const json = (await res.json()) as { access_token?: string; userid?: string };
  return json.access_token!;
}
