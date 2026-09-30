/**
 * Regression: the blog token and send records must survive a restart.
 *
 * Root cause (src/core/token.ts, migrateLegacyData): the one-time startup
 * migration (run from prepareDataDir, called on every `main()` start before
 * the account store is built) moved every non-`auth.json` file at the
 * data-dir root into the account sub-folder. blog.json and blog-sent.json
 * are written and read at the root only (defaultDataDir(), never the
 * account folder — see src/tui/blog-send-ask.ts, blog-send-dialog.tsx,
 * BottomArea.tsx). So the very next start after saving a blog token moved
 * blog.json away, and loadBlogConfig(root) stopped finding it; the same
 * happened to blog-sent.json's send records.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

import { prepareDataDir, saveToken } from '../../src/core/token';
import { saveBlogConfig, loadBlogConfig } from '../../src/core/blog-config';
import { recordBlogSend, loadBlogSend } from '../../src/core/blog-sent';

describe('blog config restart', () => {
  it('1: WHEN the blog token is saved and the startup migration runs again on the same data dir THEN loadBlogConfig still returns it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-config-restart-'));
    try {
      await saveToken(root, { email: 'a@b.co', token: 'account-tok' });
      await saveBlogConfig(root, { origin: 'https://skryf.art', token: 'blog-tok' });

      await prepareDataDir(root);

      const config = await loadBlogConfig(root);
      expect(config).toEqual({ origin: 'https://skryf.art', token: 'blog-tok' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('2: WHEN a note is recorded as sent and the startup migration runs again on the same data dir THEN loadBlogSend still returns that record', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-config-restart-'));
    try {
      await saveToken(root, { email: 'a@b.co', token: 'account-tok' });
      recordBlogSend(root, 'note1', {
        postId: 'p1',
        url: 'https://skryf.art/write/p1',
        sentAt: '2026-09-30T00:00:00.000Z',
      });

      await prepareDataDir(root);

      const record = loadBlogSend(root, 'note1');
      expect(record).toEqual({
        postId: 'p1',
        url: 'https://skryf.art/write/p1',
        sentAt: '2026-09-30T00:00:00.000Z',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('3: WHEN a blog.json already sits in the account sub-folder from a buggy earlier run THEN prepareDataDir moves it back to the root and loadBlogConfig finds it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-config-restart-'));
    try {
      await saveToken(root, { email: 'a@b.co', token: 'account-tok' });
      const acctDir = path.join(root, 'a@b.co');
      fs.mkdirSync(acctDir, { recursive: true });
      fs.writeFileSync(
        path.join(acctDir, 'blog.json'),
        JSON.stringify({ origin: 'https://skryf.art', token: 'stranded-tok' }),
      );

      await prepareDataDir(root);

      const config = await loadBlogConfig(root);
      expect(config).toEqual({ origin: 'https://skryf.art', token: 'stranded-tok' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
