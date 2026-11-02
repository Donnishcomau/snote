// snote-diet: what the screen reads about a sent note (the status line, the
// resend question); recording a send (blog-sent.ts) loads only with the send.
import * as fs from 'node:fs';
import * as path from 'node:path';

import { sanitizeForTerminal } from './sanitize';

export const BLOG_SENT_FILE = 'blog-sent.json';

interface BlogSendRecord {
  postId: string;
  url: string;
  sentAt: string;
}

/**
 * Compose the "Sent as draft" status line: the first 10 characters of
 * `sentAt` (never a locale date) plus the url. `null` renders nothing.
 */
export function blogStatusLine(
  record: Pick<BlogSendRecord, 'sentAt' | 'url'> | null | undefined,
): string | null {
  if (!record) {
    return null;
  }
  // Records saved before url normalisation may be protocol-relative.
  const rawUrl = record.url.startsWith('//') ? 'https:' + record.url : record.url;
  // The url is server text: strip control sequences, fold newlines/tabs.
  const url = sanitizeForTerminal(rawUrl).replace(/[\n\t]/g, ' ');
  return 'Sent as draft · ' + sanitizeForTerminal(record.sentAt).slice(0, 10) + ' · ' + url;
}

/**
 * Load the blog-sent record for a note id; `null` when the file is missing,
 * not valid JSON, or the note id is not present.
 */
export function loadBlogSend(
  dir: string,
  noteId: string,
): BlogSendRecord | null {
  const filePath = path.join(dir, BLOG_SENT_FILE);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data: unknown = JSON.parse(raw);
    if (
      data === null ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return null;
    }
    const record = data as Record<string, unknown>;
    if (!(noteId in record)) {
      return null;
    }
    const value = record[noteId];
    if (
      value === null ||
      typeof value !== 'object' ||
      !('postId' in value) ||
      !('url' in value) ||
      !('sentAt' in value) ||
      typeof (value as { postId: unknown }).postId !== 'string' ||
      typeof (value as { url: unknown }).url !== 'string' ||
      typeof (value as { sentAt: unknown }).sentAt !== 'string'
    ) {
      return null;
    }
    return {
      postId: (value as { postId: string }).postId,
      url: (value as { url: string }).url,
      sentAt: (value as { sentAt: string }).sentAt,
    };
  } catch {
    return null;
  }
}
