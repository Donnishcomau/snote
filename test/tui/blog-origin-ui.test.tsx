/**
 * T504 (F153): a refused blog origin in `blog.json` shows a notice and
 * sends no request. `http://localhost.:<port>` parses, but its hostname
 * `localhost.` is not a loopback name, so `isAllowed` refuses it.
 */

import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ink's ANSI frames break substring checks; search the stripped frame.
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const QUESTION = 'Send this note to your blog as a draft?';
const NOTICE = 'blog origin is not allowed';

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

// The local blog server: never expected to be reached for a refused origin.
function startBlogServer(): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'p1', url: 'https://blog.example/write/p1' }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

// XDG_DATA_HOME steers defaultDataDir(); the app uses `$XDG_DATA_HOME/snote`
// as the dir sendNoteToBlog reads blog.json from.
async function withTempDataDir(run: (dir: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'blog-origin-ui-'));
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

describe('blog origin notice (T504)', () => {
  it('6: WHEN `b` then `y` are pressed with blog.json origin `http://localhost.:<port>` of a local server THEN the frame contains `blog origin is not allowed`, fetch was called 0 times and `blog-sent.json` does not exist', async () => {
    await withTempDataDir(async (dir) => {
      const { server, port } = await startBlogServer();
      writeFileSync(
        join(dir, 'blog.json'),
        JSON.stringify({ origin: `http://localhost.:${port}`, token: 'BLOGTOKEN' }),
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 201 }),
      );
      try {
        const r = await openQuestion();
        expect(stripAnsi(r.lastFrame())).toContain(QUESTION);
        r.stdin.write('y');
        const frame = await pollUntil(r.lastFrame, (f) => f.includes(NOTICE));
        expect(frame).toContain(NOTICE);
        expect(fetchSpy).toHaveBeenCalledTimes(0);
        expect(existsSync(join(dir, 'blog-sent.json'))).toBe(false);
        r.unmount();
      } finally {
        fetchSpy.mockRestore();
        server.close();
      }
    });
  });
});
