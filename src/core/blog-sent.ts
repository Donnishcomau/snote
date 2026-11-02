import * as fs from 'node:fs';
import * as path from 'node:path';

import { secureMkdir, secureWriteFileSync } from './secure-fs';
import { BLOG_SENT_FILE, loadBlogSend } from './blog-status';

export { blogStatusLine, loadBlogSend } from './blog-status';

type BlogSendRecord = NonNullable<ReturnType<typeof loadBlogSend>>;

interface BlogSentData {
  [noteId: string]: BlogSendRecord;
}

/**
 * Record that a note was sent as a blog draft. Writes `<dir>/blog-sent.json`
 * (mode 0o600), a JSON object keyed by note id; a second call for the same
 * note id replaces the first record, other note ids are left unchanged.
 * proof: test/core/secure-fs-symlink.test.ts
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
