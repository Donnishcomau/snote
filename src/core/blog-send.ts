import { loadBlogConfig } from './blog-config.js';
import { postBlogDraft, BlogDraftResult } from './blog-client.js';
import { noteToBlogDraft } from './blog-draft.js';
import { recordBlogSend, loadBlogSend } from './blog-sent.js';

export interface SendNoteToBlogOptions {
  dir: string;
  noteId: string;
  content: string;
  force: boolean;
  now: string;
}

export interface SendNoteToBlogResult {
  url: string;
  sentAt: string;
  postId: string;
  already?: false;
}

export interface AlreadySentResult {
  already: true;
}

/**
 * Send a note as a blog draft.
 *
 * - Loads `blog.json` config; throws if missing.
 * - Checks whether a send record already exists; returns `{ already: true }` if
 *   one exists and `force` is false.
 * - Builds the draft with `noteToBlogDraft` and POSTs it with `postBlogDraft`.
 * - On success records the send with `sentAt` equal to `now`.
 */
export async function sendNoteToBlog({
  dir,
  noteId,
  content,
  force,
  now,
}: SendNoteToBlogOptions): Promise<SendNoteToBlogResult | AlreadySentResult> {
  const config = await loadBlogConfig(dir);
  if (!config) {
    throw new Error('blog is not configured');
  }

  const existing = loadBlogSend(dir, noteId);
  if (existing && !force) {
    return { already: true };
  }

  const { title, markdown } = noteToBlogDraft(content);
  const result: BlogDraftResult = await postBlogDraft({
    origin: config.origin,
    token: config.token,
    title,
    markdown,
  });

  recordBlogSend(dir, noteId, {
    postId: result.id,
    url: result.url,
    sentAt: now,
  });

  return {
    url: result.url,
    sentAt: now,
    postId: result.id,
    already: false,
  };
}
