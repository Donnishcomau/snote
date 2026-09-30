import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { secureMkdir } from './secure-fs';

const BLOG_FILE = 'blog.json';

/** T340: the out-of-the-box blog origin (owner's choice, 2026-09-30). */
export const DEFAULT_BLOG_ORIGIN = 'https://skryf.art';

/**
 * The blog origin to use when no `blog.json` is saved: `SNOTE_BLOG_ORIGIN`
 * when set to a non-empty string, otherwise `DEFAULT_BLOG_ORIGIN`.
 */
export function blogOriginFromEnv(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.SNOTE_BLOG_ORIGIN;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BLOG_ORIGIN;
}

interface BlogConfigPayload {
  origin: string;
  token: string;
}

/**
 * Save a blog origin and bearer token to `<dir>/blog.json` with mode 0o600.
 *
 * - The origin must start with `https://`.  `http://` origins are rejected.
 * - A single trailing slash on the origin is stripped before writing.
 * - `auth.json` in the same directory is never touched.
 *
 * Errors on an empty token as well (the token must be a non-empty string).
 */
export async function saveBlogConfig(
  dir: string,
  { origin, token }: { origin: string; token: string },
): Promise<void> {
  if (!origin.startsWith('https://')) {
    throw new Error(
      `Invalid blog origin: must start with https://, got "${origin}"`,
    );
  }
  if (!token || token.length === 0) {
    throw new Error('Blog token must be a non-empty string');
  }

  const filePath = path.join(dir, BLOG_FILE);
  const trimmedOrigin = origin.replace(/\/+$/, '');
  const payload: BlogConfigPayload = { origin: trimmedOrigin, token };
  const data = JSON.stringify(payload);

  secureMkdir(dir);
  fs.writeFileSync(filePath, data, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

/**
 * Load the blog config from `<dir>/blog.json`.
 *
 * Returns `null` when the file is missing, not valid JSON, or does not
 * contain the expected `origin` and `token` string keys.
 */
export async function loadBlogConfig(
  dir: string,
): Promise<{ origin: string; token: string } | null> {
  const filePath = path.join(dir, BLOG_FILE);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('origin' in parsed) ||
    !('token' in parsed) ||
    typeof (parsed as { origin: unknown }).origin !== 'string' ||
    typeof (parsed as { token: unknown }).token !== 'string'
  ) {
    return null;
  }
  return {
    origin: (parsed as { origin: string }).origin,
    token: (parsed as { token: string }).token,
  };
}
