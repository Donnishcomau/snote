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

  it('5: WHEN recordBlogSend stores `__proto__` first in an empty directory, then every other Object.prototype name and note-1, each with postId p-<id>, THEN loadBlogSend returns postId p-<id> for every one of them and blog-sent.json holds every id', () => {
    const names = ['__proto__', ...Object.getOwnPropertyNames(Object.prototype).filter((n) => n !== '__proto__'), 'note-1'];
    for (const id of names) recordBlogSend(tmpDir, id, { postId: `p-${id}`, url: 'https://blog.example/write/p', sentAt: '2026-11-07T00:00:00.000Z' });
    const saved = Object.keys(JSON.parse(fs.readFileSync(path.join(tmpDir, 'blog-sent.json'), 'utf8'))).sort();
    expect({ postIds: names.map((id) => loadBlogSend(tmpDir, id)?.postId), saved }).toEqual({ postIds: names.map((id) => `p-${id}`), saved: [...names].sort() });
  });

  it('6: WHEN blog-sent.json already holds note-1 and recordBlogSend then stores `__proto__` with postId p9 THEN loadBlogSend returns p9 for `__proto__` and p1 for note-1, and loadBlogSend for `constructor` (never sent) returns null', () => {
    recordBlogSend(tmpDir, 'note-1', { postId: 'p1', url: 'https://blog.example/write/p1', sentAt: '2026-11-07T00:00:00.000Z' });
    recordBlogSend(tmpDir, '__proto__', { postId: 'p9', url: 'https://blog.example/write/p9', sentAt: '2026-11-07T00:00:01.000Z' });
    expect([loadBlogSend(tmpDir, '__proto__')?.postId, loadBlogSend(tmpDir, 'note-1')?.postId, loadBlogSend(tmpDir, 'constructor')]).toEqual(['p9', 'p1', null]);
  });
});
