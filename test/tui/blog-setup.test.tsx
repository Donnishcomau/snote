/**
 * T332: b asks for the blog origin and token, then confirms a second send.
 */

import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { loadBlogConfig } from '../../src/core/blog-config';
import { loadBlogSend, recordBlogSend } from '../../src/core/blog-sent';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const SEND = 'Send this note to your blog as a draft?';
const RESEND = 'Already sent as a draft. Send again as a new draft?';

async function pollUntil(
  lastFrame: () => string | undefined,
  done: (frame: string) => boolean,
): Promise<string> {
  let frame = '';
  for (let i = 0; i < 40; i++) {
    await delay(50);
    frame = stripAnsi(lastFrame());
    if (done(frame)) return frame;
  }
  return frame;
}

async function withTempDataDir(run: (dir: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'blog-setup-'));
  const dir = join(base, 'snote');
  mkdirSync(dir, { recursive: true });
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    await run(dir);
  } finally {
    if (prev === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prev;
    rmSync(base, { recursive: true, force: true });
  }
}

function renderNote(noteId: string): ReturnType<typeof render> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: noteId as never,
    note: {
      content: 'Hello from the note',
      tags: [],
      systemTags: [],
      deleted: false,
      creationDate: 1000,
      modificationDate: 1000,
    } as never,
  });
  return render(<App store={store} width={80} height={24} />);
}

async function focusAndPressB(r: ReturnType<typeof render>): Promise<void> {
  await delay(50);
  r.stdin.write('\t');
  await delay(50);
  r.stdin.write('b');
}

function startBlogServer(body: unknown): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('blog setup (T332)', () => {
  it('1: WHEN `b` is pressed with no `blog.json` THEN the frame contains `Skryf token`', async () => {
    await withTempDataDir(async (dir) => {
      const r = renderNote('s1');
      await focusAndPressB(r);
      const frame = await pollUntil(r.lastFrame, (f) => f.includes('Skryf token'));
      expect(frame).toContain('Skryf token');
      expect(existsSync(join(dir, 'blog.json'))).toBe(false);
      r.unmount();
    });
  });

  it('2: WHEN `SNOTE_BLOG_ORIGIN` is `https://blog.example` and the token `secret-token` is entered THEN `loadBlogConfig` returns that origin and token, and the frame contains `Send this note to your blog as a draft?`', async () => {
    const prevOrigin = process.env.SNOTE_BLOG_ORIGIN;
    process.env.SNOTE_BLOG_ORIGIN = 'https://blog.example';
    try {
      await withTempDataDir(async (dir) => {
        const r = renderNote('s1');
        await focusAndPressB(r);
        await pollUntil(r.lastFrame, (f) => f.includes('Blog token'));
        await delay(100);
        r.stdin.write('secret-token\r');
        const frame = await pollUntil(r.lastFrame, (f) => f.includes(SEND));
        const config = await loadBlogConfig(dir);
        expect(frame).toContain('Send this note to your blog as a draft?');
        expect(config?.origin).toBe('https://blog.example');
        expect(config?.token).toBe('secret-token');
        expect(frame).toContain('Send this note to your blog as a draft?');
        r.unmount();
      });
    } finally {
      if (prevOrigin === undefined) delete process.env.SNOTE_BLOG_ORIGIN;
      else process.env.SNOTE_BLOG_ORIGIN = prevOrigin;
    }
  }, 10000);

  it('3: WHEN Escape is pressed on the token prompt THEN `blog.json` does not exist', async () => {
    await withTempDataDir(async (dir) => {
      const r = renderNote('s1');
      await focusAndPressB(r);
      await pollUntil(r.lastFrame, (f) => f.includes('Skryf token'));
      r.stdin.write('\u001b');
      await delay(80);
      expect(existsSync(join(dir, 'blog.json'))).toBe(false);
      r.unmount();
    });
  });

  it('4: WHEN a send record already exists and `b` is pressed THEN the frame contains `Already sent as a draft. Send again as a new draft?`', async () => {
    await withTempDataDir(async (dir) => {
      writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin: 'https://blog.example', token: 'tok' }));
      recordBlogSend(dir, 's1', {
        postId: 'p1',
        url: 'https://blog.example/write/p1',
        sentAt: '2026-09-28T00:00:00.000Z',
      });
      const r = renderNote('s1');
      await focusAndPressB(r);
      const frame = await pollUntil(r.lastFrame, (f) => f.includes(RESEND));
      expect(frame).toContain('Already sent as a draft. Send again as a new draft?');
      r.unmount();
    });
  });

  it('5: WHEN `y` is pressed on that question and the server returns 201 with url `https://blog.example/write/p2` THEN `loadBlogSend` returns url `https://blog.example/write/p2`', async () => {
    await withTempDataDir(async (dir) => {
      const { server, url } = await startBlogServer({ id: 'p2', url: 'https://blog.example/write/p2' });
      writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin: url, token: 'tok' }));
      recordBlogSend(dir, 's1', {
        postId: 'p1',
        url: 'https://blog.example/write/p1',
        sentAt: '2026-09-28T00:00:00.000Z',
      });
      try {
        const r = renderNote('s1');
        await focusAndPressB(r);
        await pollUntil(r.lastFrame, (f) => f.includes(RESEND));
        r.stdin.write('y');
        await pollUntil(r.lastFrame, () => loadBlogSend(dir, 's1')?.url === 'https://blog.example/write/p2');
        expect(loadBlogSend(dir, 's1')?.url).toBe('https://blog.example/write/p2');
        r.unmount();
      } finally {
        server.close();
      }
    });
  });
});
