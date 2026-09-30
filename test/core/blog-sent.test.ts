import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { recordBlogSend, loadBlogSend } from '../../src/core/blog-sent';

let tmpDir: string;

function setupTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blog-sent-test-'));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('blog-sent', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it('1: WHEN recordBlogSend stores note note-1 with postId p1, url https://blog.example/write/p1, and sentAt 2026-09-28T00:00:00.000Z THEN loadBlogSend returns those three values', async () => {
    recordBlogSend(tmpDir, 'note-1', {
      postId: 'p1',
      url: 'https://blog.example/write/p1',
      sentAt: '2026-09-28T00:00:00.000Z',
    });

    const result = loadBlogSend(tmpDir, 'note-1');
    expect(result).not.toBeNull();
    expect(result!.postId).toBe('p1');
    expect(result!.url).toBe('https://blog.example/write/p1');
    expect(result!.sentAt).toBe('2026-09-28T00:00:00.000Z');
  });

  it('2: WHEN loadBlogSend is called for missing in an empty directory THEN it returns null', async () => {
    const result = loadBlogSend(tmpDir, 'missing');
    expect(result).toBeNull();
  });

  it('3: WHEN note-1 is recorded again with postId p2 THEN loadBlogSend for note-1 returns postId p2 and the file still parses as one JSON object', async () => {
    recordBlogSend(tmpDir, 'note-1', {
      postId: 'p1',
      url: 'https://blog.example/write/p1',
      sentAt: '2026-09-28T00:00:00.000Z',
    });

    recordBlogSend(tmpDir, 'note-1', {
      postId: 'p2',
      url: 'https://blog.example/write/p2',
      sentAt: '2026-09-29T00:00:00.000Z',
    });

    const result = loadBlogSend(tmpDir, 'note-1');
    expect(result).not.toBeNull();
    expect(result!.postId).toBe('p2');

    const filePath = path.join(tmpDir, 'blog-sent.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(typeof parsed).toBe('object');
    expect(Array.isArray(parsed)).toBe(false);
  });

  it('4: WHEN note-2 is recorded after note-1 THEN loadBlogSend for note-1 still returns postId p1', async () => {
    recordBlogSend(tmpDir, 'note-1', {
      postId: 'p1',
      url: 'https://blog.example/write/p1',
      sentAt: '2026-09-28T00:00:00.000Z',
    });

    recordBlogSend(tmpDir, 'note-2', {
      postId: 'p2',
      url: 'https://blog.example/write/p2',
      sentAt: '2026-09-29T00:00:00.000Z',
    });

    const result = loadBlogSend(tmpDir, 'note-1');
    expect(result).not.toBeNull();
    expect(result!.postId).toBe('p1');
  });
});
