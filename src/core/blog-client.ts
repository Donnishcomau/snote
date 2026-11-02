import { boundedRequest } from './bounded-request';

/** Give-up time for one blog send (ms), covering connect, headers and the whole reply. */
const DEFAULT_TIMEOUT_MS = 15000;

interface BlogDraftOptions {
  origin: string;
  token: string;
  title: string;
  markdown: string;
  /** Milliseconds before the send gives up (default 15000). */
  timeoutMs?: number;
}

export interface BlogDraftResult {
  id: string;
  url: string;
}

/**
 * Make the url an API reply returns clickable: `//host/x` takes the scheme
 * of `origin`, `/path` is joined to `origin`, absolute urls are unchanged.
 */
export function normalizeBlogUrl(url: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  if (url.startsWith('//')) {
    const scheme = /^(https?:)\/\//i.exec(base)?.[1] ?? 'https:';
    return scheme + url;
  }
  if (url.startsWith('/')) {
    return base + url;
  }
  return url;
}

export async function postBlogDraft({
  origin,
  token,
  title,
  markdown,
  timeoutMs,
}: BlogDraftOptions): Promise<BlogDraftResult> {
  const trimmedOrigin = origin.replace(/\/+$/, '');
  const url = `${trimmedOrigin}/api/agent/posts`;

  const response = await boundedRequest(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, markdown, draft: true }),
      redirect: 'error',
    },
    { timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS },
  );

  if (response.status === 201) {
    const body = response.json() as { id: string; url: string };
    return { id: body.id, url: normalizeBlogUrl(body.url, origin) };
  }

  if (response.status === 401) {
    throw new Error('unauthorized');
  }

  if (response.status === 422) {
    const body = response.json() as { error: string };
    throw new Error(body.error);
  }

  if (response.status === 429) {
    throw new Error('rate limited');
  }

  throw new Error(`HTTP ${response.status}`);
}
