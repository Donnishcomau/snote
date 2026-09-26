// T73: the three login calls the root screen hands to the login screen.
// No side effects when this module loads or when loginCalls() runs.

import {
  requestLoginCode,
  completeLogin,
  loginWithPassword,
  type AuthOpts,
} from '../core/auth';

export interface LoginCalls {
  requestCode: (email: string) => Promise<unknown>;
  completeLogin: (email: string, code: string) => Promise<string>;
  passwordLogin: (email: string, password: string) => Promise<string>;
}

/**
 * Build the login call trio bound to an optional fake-server URL.
 *
 * With a `server` (`ws://host` or `wss://host`), both HTTP bases point at
 * the same host over http/https. Without one, the production defaults in
 * `src/core/auth` apply and only `appId` is overridden.
 */
export function loginCalls(server: string | undefined, appId: string): LoginCalls {
  let opts: AuthOpts;
  if (server) {
    const base = server.replace(/^ws/, 'http');
    opts = { accountBase: base, authBase: base, appId };
  } else {
    opts = { appId };
  }
  return {
    requestCode: (email) => requestLoginCode(email, opts),
    completeLogin: (email, code) => completeLogin(email, code, opts),
    passwordLogin: (email, password) => loginWithPassword(email, password, opts),
  };
}
