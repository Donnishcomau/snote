/**
 * #244: once a blog send is confirmed, no further y answers a send question
 * until that send has finished (success or error). Each `stdin.write` below is
 * one read.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const SEND = 'Send this note to your blog as a draft?';
const SENT = 'draft sent to your blog';
const BUSY = 'still sending to your blog';

type Mode = 'ok' | 'hold' | 'error';

interface Blog {
  hits: () => number;
  mode: (m: Mode) => void;
  release: () => void;
}

/** A blog on localhost that counts the drafts it receives; blog.json in a temp data dir. */
async function withBlog(run: (blog: Blog) => Promise<void>): Promise<void> {
  let hits = 0;
  let mode: Mode = 'ok';
  const held: ServerResponse[] = [];
  const answer = (res: ServerResponse, m: Mode) => {
    if (m === 'error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'p1', url: 'https://blog.example/write/p1' }));
  };
  const server = createServer((req, res) => {
    hits += 1;
    req.resume();
    req.on('end', () => {
      if (mode === 'hold') held.push(res);
      else answer(res, mode);
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const base = mkdtempSync(join(tmpdir(), 'blog-send-double-y-'));
  const dir = join(base, 'snote');
  mkdirSync(dir, { recursive: true });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin, token: 'tok' }));
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    await run({
      hits: () => hits,
      mode: (m) => { mode = m; },
      release: () => { while (held.length > 0) answer(held.shift() as ServerResponse, 'ok'); },
    });
  } finally {
    if (prev === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prev;
    while (held.length > 0) held.shift()?.destroy();
    server.closeAllConnections();
    server.close();
    rmSync(base, { recursive: true, force: true });
  }
}

async function at(notes: Array<[string, string]>) {
  const store = makeStore({ stubClient: {} });
  notes.forEach(([id, content], i) => {
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid(id),
      note: { content, systemTags: [], tags: [] as unknown as TagName[], deleted: false, modificationDate: 2000 - i, creationDate: 2000 - i },
    });
  });
  const r = render(<App store={store} width={80} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, (f) => strip(f).includes(notes[0][1].split('\n')[0]));
  const seen = (text: string) => waitForFrame(r.lastFrame, (f) => strip(f).includes(text));
  return { ...r, seen };
}

async function openQuestion(a: Awaited<ReturnType<typeof at>>, focused: boolean): Promise<void> {
  if (!focused) {
    a.stdin.write('\t');
    await a.seen('focus: preview');
  }
  a.stdin.write('b');
  await a.seen(`${SEND} y/n`);
}

const gone = (a: Awaited<ReturnType<typeof at>>) =>
  waitForFrame(a.lastFrame, (f) => !strip(f).includes(`${SEND} y/n`));

describe('#244 two y reads send the draft once', () => {
  it('1: WHEN the question `Send this note to your blog as a draft? y/n` is open and `y` and `y` are written as two reads back to back THEN the blog receives exactly `1` draft and the frame contains `draft sent to your blog`', async () => {
    await withBlog(async (blog) => {
      const a = await at([['t1', 'hello world']]);
      await openQuestion(a, false);
      a.stdin.write('y');
      a.stdin.write('y');
      const frame = await a.seen(SENT);
      expect(blog.hits()).toBe(1);
      expect(strip(frame)).toContain(SENT);
      a.unmount();
    });
  });

  it('2: WHEN the blog holds the first draft request open, `b` reopens the question and `y` is written THEN the blog has received exactly `1` request while it is held, and after it answers the frame contains `draft sent to your blog`', async () => {
    await withBlog(async (blog) => {
      blog.mode('hold');
      const a = await at([['t1', 'hello world']]);
      await openQuestion(a, false);
      a.stdin.write('y');
      await vi.waitFor(() => expect(blog.hits()).toBe(1));
      await gone(a);
      a.stdin.write('b');
      await a.seen(`${SEND} y/n`);
      a.stdin.write('y');
      await gone(a);
      expect(blog.hits()).toBe(1);
      blog.release();
      const frame = await a.seen(SENT);
      expect(blog.hits()).toBe(1);
      expect(strip(frame)).toContain(SENT);
      a.unmount();
    });
  });

  it('3: WHEN `yy` is written as one read at the question THEN the blog receives `0` drafts and the frame still contains `Send this note to your blog as a draft? y/n`', async () => {
    await withBlog(async (blog) => {
      const a = await at([['t1', 'hello world']]);
      await openQuestion(a, false);
      a.stdin.write('yy');
      // a fixed count of later reads proves nothing arrived: send a no-op key and wait for its effect
      a.stdin.write('\x1b[B');
      const frame = await a.seen(`${SEND} y/n`);
      expect(blog.hits()).toBe(0);
      expect(strip(frame)).toContain(`${SEND} y/n`);
      a.unmount();
    });
  });

  it('4: WHEN the first send has finished and `b` then `y` are pressed THEN the blog receives a second draft, `2` in all', async () => {
    await withBlog(async (blog) => {
      const a = await at([['t1', 'hello world']]);
      await openQuestion(a, false);
      a.stdin.write('y');
      await a.seen(SENT);
      await gone(a);
      a.stdin.write('b');
      await a.seen('Already sent as a draft. Send again as a new draft? y/n');
      a.stdin.write('y');
      await vi.waitFor(() => expect(blog.hits()).toBe(2));
      expect(blog.hits()).toBe(2);
      a.unmount();
    });
  });

  it('5: WHEN the blog answers the first draft request with an error (HTTP `500`) and the frame shows the error, and then `b` and `y` are pressed THEN the blog receives a second request, `2` in all', async () => {
    await withBlog(async (blog) => {
      blog.mode('error');
      const a = await at([['t1', 'hello world']]);
      await openQuestion(a, false);
      a.stdin.write('y');
      await vi.waitFor(() => expect(blog.hits()).toBe(1));
      await waitForFrame(a.lastFrame, (f) => /500|boom|fail/i.test(strip(f)));
      await gone(a);
      a.stdin.write('b');
      await a.seen(`${SEND} y/n`);
      a.stdin.write('y');
      await vi.waitFor(() => expect(blog.hits()).toBe(2));
      expect(blog.hits()).toBe(2);
      a.unmount();
    });
  });

  it('6: WHEN the blog holds the first draft request open, another note is selected, `b` opens the question for that note and `y` is written THEN the blog has received exactly `1` request and the frame contains `still sending to your blog`', async () => {
    await withBlog(async (blog) => {
      blog.mode('hold');
      const a = await at([['t1', 'first note'], ['t2', 'second note']]);
      await openQuestion(a, false);
      a.stdin.write('y');
      await vi.waitFor(() => expect(blog.hits()).toBe(1));
      await gone(a);
      a.stdin.write('\x1b[D');
      await waitForFrame(a.lastFrame, (f) => !strip(f).includes('focus: preview'));
      a.stdin.write('\x1b[B');
      await a.seen('Preview: second note');
      a.stdin.write('\x1b[C');
      await a.seen('focus: preview');
      a.stdin.write('b');
      await a.seen(`${SEND} y/n`);
      a.stdin.write('y');
      const frame = await a.seen(BUSY);
      expect(blog.hits()).toBe(1);
      expect(strip(frame)).toContain(BUSY);
      blog.release();
      a.unmount();
    });
  });
});
