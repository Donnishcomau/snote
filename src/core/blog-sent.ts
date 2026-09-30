import * as fs from 'node:fs';
import * as path from 'node:path';

import { secureMkdir, secureWriteFileSync } from './secure-fs';

const BLOG_SENT_FILE = 'blog-sent.json';

export interface BlogSendRecord {
  postId: string;
  url: string;
  sentAt: string;
}

export interface BlogSentData {
  [noteId: string]: BlogSendRecord;
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
  return 'Sent as draft · ' + record.sentAt.slice(0, 10) + ' · ' + record.url;
}

/**
 * Record that a note was sent as a blog draft. Writes `<dir>/blog-sent.json`
 * (mode 0o600), a JSON object keyed by note id; a second call for the same
 * note id replaces the first record, other note ids are left unchanged.
 */
export function recordBlogSend(
  dir: string,
  noteId: string,
  { postId, url, sentAt }: BlogSendRecord,
): void {
  const filePath = path.join(dir, BLOG_SENT_FILE);

  let data: BlogSentData = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }

  data[noteId] = { postId, url, sentAt };

  secureMkdir(dir);
  secureWriteFileSync(filePath, JSON.stringify(data));
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
