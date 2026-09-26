/**
 * Authentication helpers for the headless client.
 *
 * All three functions perform a single HTTP POST and return the JSON body
 * (or throw on non-2xx).  The functions accept explicit URL base so that
 * tests can pass in the fake-server endpoint.
 */

import { AUTH_BASE, ACCOUNT_BASE, APP_ID, API_KEY } from './config';

/**
 * Result of requesting a login code via email.
 */
export interface LoginCodeResult {
  /** True when the code was requested successfully (server accepted the email) */
  ok: boolean;
}

/**
 * Result of completing a login with a received code.
 */
export interface LoginTokenResult {
  /** The simperium sync_token on success */
  token?: string;
  /** True when the login succeeded */
  ok: boolean;
  /** Error message when the login failed */
  error?: string;
}

/**
 * Result of password-based login.
 */
export interface PasswordLoginResult {
  /** The simperium access_token on success */
  token?: string;
  /** The user id on success */
  userId?: string;
  /** True when the login succeeded */
  ok: boolean;
  /** Error message when the login failed */
  error?: string;
}

/**
 * Options object for auth functions.
 */
export interface AuthOpts {
  accountBase?: string;
  authBase?: string;
  appId?: string;
  apiKey?: string;
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email.trim().toLowerCase(),
      request_source: 'electron',
    }),
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email.trim().toLowerCase(),
      auth_code: code.trim().toUpperCase(),
    }),
  });

  if (!res.ok) {
    let message = `completeLogin failed: ${res.status}`;
    try {
      const errBody = (await res.json()) as Record<string, unknown>;
      if (errBody.message) message = String(errBody.message);
    } catch { /* ignore */ }
    throw new Error(`${res.status} ${message}`);
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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Simperium-API-Key': apiKey,
    },
    body: JSON.stringify({
      username: email.trim().toLowerCase(),
      password,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }

  const json = (await res.json()) as { access_token?: string; userid?: string };
  return json.access_token!;
}
