/**
 * T339: `y` on the send-to-blog question posts the draft.
 *
 * BottomArea's Confirm answer flows through core's sendNoteToBlog
 * (force false): a 201 reply is recorded for loadBlogSend, a 401 reply
 * lands in the notice line as "unauthorized" and writes nothing.
 * App.tsx keeps its 247 physical lines.
 */

import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { loadBlogSend } from '../../src/core/blog-sent';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ink's ANSI frames break substring checks; search the stripped frame.
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const QUESTION = 'Send this note to your blog as a draft?';

// Poll a condition, sampling every 50 ms, and return the last frame seen.
// Every value an assertion needs comes from the frame it returns, so the
// poll and the assertion share one source.
async function pollUntil(
  lastFrame: () => string | undefined,
  done: (frame: string) => boolean,
): Promise<string> {
  let frame = '';
  for (let i = 0; i < 50; i++) {
    await delay(50);
    frame = stripAnsi(lastFrame());
    if (done(frame)) return frame;
  }
  return frame;
}

// The local blog server: POST answers with `reply`. The request path is
// ignored, so /api/agent/posts (postBlogDraft's URL) is answered.
function startBlogServer(reply: {
  status: number;
  body?: unknown;
}): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// XDG_DATA_HOME steers defaultDataDir(); the app uses `$XDG_DATA_HOME/snote`
// as the dir sendNoteToBlog reads blog.json from and writes blog-sent.json
// to, so the test writes/reads under that same subdir.
async function withTempDataDir(run: (dir: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'blog-send-key-'));
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

// Render App with one selected note, focus the note pane (Tab), open the
// question (b), and wait until it shows.
async function openQuestion(): Promise<ReturnType<typeof render>> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: 'k1' as never,
    note: {
      content: 'Hello',
      tags: [],
      systemTags: [],
      deleted: false,
      creationDate: 1000,
      modificationDate: 1000,
    } as never,
  });
  const r = render(<App store={store} width={80} height={24} />);
  await delay(50);
  r.stdin.write('\t');
  await delay(50);
  r.stdin.write('b');
  await pollUntil(r.lastFrame, (f) => f.includes(QUESTION));
  return r;
}

describe('blog send key (T339)', () => {
  it('1: WHEN `y` is pressed on the question and the server returns 201 with url `https://blog.example/write/p1` THEN `loadBlogSend` returns that url', async () => {
    await withTempDataDir(async (dir) => {
      const { server, url } = await startBlogServer({
        status: 201,
        body: { id: 'p1', url: 'https://blog.example/write/p1' },
      });
      writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin: url, token: 'test-token' }));
      try {
        const r = await openQuestion();
        expect(stripAnsi(r.lastFrame())).toContain(QUESTION);
        r.stdin.write('y');
        await pollUntil(r.lastFrame, () => loadBlogSend(dir, 'k1') !== null);
        const record = loadBlogSend(dir, 'k1');
        expect(record).not.toBeNull();
        expect(record!.url).toBe('https://blog.example/write/p1');
        r.unmount();
      } finally {
        server.close();
      }
    });
  });

  it('2: WHEN the server returns 401 THEN the frame contains `unauthorized` and no `blog-sent.json` exists', async () => {
    await withTempDataDir(async (dir) => {
      const { server, url } = await startBlogServer({ status: 401 });
      writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin: url, token: 'test-token' }));
      try {
        const r = await openQuestion();
        expect(stripAnsi(r.lastFrame())).toContain(QUESTION);
        r.stdin.write('y');
        const frame = await pollUntil(r.lastFrame, (f) => f.includes('unauthorized'));
        expect(frame).toContain('unauthorized');
        expect(existsSync(join(dir, 'blog-sent.json'))).toBe(false);
        r.unmount();
      } finally {
        server.close();
      }
    });
  });

  it("3: WHEN `src/tui/App.tsx` is read THEN `split('\\n').length` is `247`", () => {
    const source = readFileSync(join(process.cwd(), 'src', 'tui', 'App.tsx'), 'utf8');
    // Physical lines: trimEnd drops the empty element a trailing newline adds.
    expect(source.trimEnd().split('\n').length).toBe(247);
  });
});
