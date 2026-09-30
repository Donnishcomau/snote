export interface BlogDraftOptions {
  origin: string;
  token: string;
  title: string;
  markdown: string;
}

export interface BlogDraftResult {
  id: string;
  url: string;
}

export async function postBlogDraft({
  origin,
  token,
  title,
  markdown,
}: BlogDraftOptions): Promise<BlogDraftResult> {
  const trimmedOrigin = origin.replace(/\/+$/, '');
  const url = `${trimmedOrigin}/api/agent/posts`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title, markdown, draft: true }),
  });

  if (response.status === 201) {
    const body = (await response.json()) as { id: string; url: string };
    return { id: body.id, url: body.url };
  }

  if (response.status === 401) {
    throw new Error('unauthorized');
  }

  if (response.status === 422) {
    const body = (await response.json()) as { error: string };
    throw new Error(body.error);
  }

  if (response.status === 429) {
    throw new Error('rate limited');
  }

  throw new Error(`HTTP ${response.status}`);
}
