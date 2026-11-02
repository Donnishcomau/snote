import { loadBlogConfig } from './blog-config.js';
import { isAllowed } from './endpoint-check.js';
import { postBlogDraft, BlogDraftResult } from './blog-client.js';
import { noteToBlogDraft } from './blog-draft.js';
import { recordBlogSend } from './blog-sent.js';
import { loadBlogSend } from './blog-status.js';

interface SendNoteToBlogOptions {
  dir: string;
  noteId: string;
  content: string;
  force: boolean;
  now: string;
}

interface SendNoteToBlogResult {
  url: string;
  sentAt: string;
  postId: string;
  already?: false;
}

interface AlreadySentResult {
  already: true;
}

// #244: at most one send in flight across the app (one slot, no collection).
// A further call for the same note settles with that send's outcome; a call
// for another note is refused. Cleared when the send settles, either way.
let inFlight: { noteId: string; done: Promise<SendNoteToBlogResult | AlreadySentResult> } | null = null;

/**
 * Send a note as a blog draft.
 *
 * - Loads `blog.json` config; throws if missing.
 * - Checks whether a send record already exists; returns `{ already: true }` if
 *   one exists and `force` is false.
 * - Builds the draft with `noteToBlogDraft` and POSTs it with `postBlogDraft`.
 * - On success records the send with `sentAt` equal to `now`.
 */
export function sendNoteToBlog(
  options: SendNoteToBlogOptions,
): Promise<SendNoteToBlogResult | AlreadySentResult> {
  if (inFlight) {
    return inFlight.noteId === options.noteId
      ? inFlight.done
      : Promise.reject(new Error('still sending to your blog'));
  }
  const slot = {
    noteId: options.noteId,
    done: sendOnce(options).finally(() => {
      if (inFlight === slot) inFlight = null;
    }),
  };
  inFlight = slot;
  return slot.done;
}

async function sendOnce({
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
  if (!isAllowed(config.origin)) {
    throw new Error(
      'blog origin is not allowed: use https (http only for localhost)'
    );
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
