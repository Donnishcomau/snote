/**
 * T419: endpoint override safety. A pure check of an env object — nothing
 * here reads the network or mutates state.
 *
 * `SNOTE_AUTH_BASE`, `SNOTE_ACCOUNT_BASE` and `SNOTE_BLOG_ORIGIN` carry
 * credentials and bearer tokens, so an override must be https:// — plain
 * http:// is only ever sane against a loopback dev server. And
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` silently disables certificate checks
 * for login and sync, so it earns a printed warning.
 */

const ENDPOINT_VARS = [
  'SNOTE_AUTH_BASE',
  'SNOTE_ACCOUNT_BASE',
  'SNOTE_BLOG_ORIGIN',
] as const;

export interface EndpointCheck {
  /** Lines to print as warnings; never fatal on their own. */
  warnings: string[];
  /** Lines to print as errors; any entry means the run must refuse. */
  errors: string[];
}

/** True when `value` parses as a URL (a value that does not parse is
 *  refused) whose protocol is https: with a non-empty hostname, or http:
 *  with hostname exactly localhost, 127.0.0.1 or [::1]. A URL carrying a
 *  non-empty username or password is refused in every case. */
export function isAllowed(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  if (url.protocol === 'https:') return url.hostname !== '';
  if (url.protocol === 'http:') {
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  }
  return false;
}

export function checkEndpoints(env: NodeJS.ProcessEnv): EndpointCheck {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const name of ENDPOINT_VARS) {
    const value = env[name];
    if (value !== undefined && value !== '' && !isAllowed(value)) {
      errors.push(
        `error: ${name} must be an https:// address without a username or password ` +
          '(http:// is allowed only for localhost, 127.0.0.1 and [::1])'
      );
    }
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    warnings.push(
      'warning: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checks for login and sync'
    );
  }
  return { warnings, errors };
}
