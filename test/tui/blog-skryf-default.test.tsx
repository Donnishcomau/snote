/**
 * T340: Skryf is the ready-to-go blog default; `b` asks only for the token.
 */

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { blogOriginFromEnv, loadBlogConfig } from '../../src/core/blog-config';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const SEND = 'Send this note to your blog as a draft?';

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
  const base = mkdtempSync(join(tmpdir(), 'blog-skryf-default-'));
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

describe('Skryf blog default (T340)', () => {
  it('1: WHEN `b` is pressed on a note with no `blog.json` and `SNOTE_BLOG_ORIGIN` unset THEN the frame contains `Skryf token` and `https://skryf.art/settings/keys`, and does not contain `Blog origin`', async () => {
    const prevOrigin = process.env.SNOTE_BLOG_ORIGIN;
    delete process.env.SNOTE_BLOG_ORIGIN;
    try {
      await withTempDataDir(async () => {
        const r = renderNote('s1');
        await focusAndPressB(r);
        const frame = await pollUntil(r.lastFrame, (f) => f.includes('Skryf token'));
        expect(frame).toContain('Skryf token');
        expect(frame).toContain('https://skryf.art/settings/keys');
        expect(frame).not.toContain('Blog origin');
        r.unmount();
      });
    } finally {
      if (prevOrigin === undefined) delete process.env.SNOTE_BLOG_ORIGIN;
      else process.env.SNOTE_BLOG_ORIGIN = prevOrigin;
    }
  });

  it('2: WHEN the token `tok1` and `\\r` are then typed THEN `loadBlogConfig` returns origin `https://skryf.art` and token `tok1`, and the frame contains `Send this note to your blog as a draft?`', async () => {
    const prevOrigin = process.env.SNOTE_BLOG_ORIGIN;
    delete process.env.SNOTE_BLOG_ORIGIN;
    try {
      await withTempDataDir(async (dir) => {
        const r = renderNote('s1');
        await focusAndPressB(r);
        await pollUntil(r.lastFrame, (f) => f.includes('Skryf token'));
        await delay(100);
        r.stdin.write('tok1\r');
        const frame = await pollUntil(
          r.lastFrame,
          (f) => f.includes(SEND),
        );
        const config = await loadBlogConfig(dir);
        expect(frame).toContain(SEND);
        expect(config?.origin).toBe('https://skryf.art');
        expect(config?.token).toBe('tok1');
        r.unmount();
      });
    } finally {
      if (prevOrigin === undefined) delete process.env.SNOTE_BLOG_ORIGIN;
      else process.env.SNOTE_BLOG_ORIGIN = prevOrigin;
    }
  }, 10000);

  it('3: WHEN `SNOTE_BLOG_ORIGIN` is `https://blog.example/` and `b` is pressed with no `blog.json` THEN the frame contains `Blog token` and not `Skryf token`; after `tok2` and `\\r`, `loadBlogConfig` returns origin `https://blog.example`', async () => {
    const prevOrigin = process.env.SNOTE_BLOG_ORIGIN;
    process.env.SNOTE_BLOG_ORIGIN = 'https://blog.example/';
    try {
      await withTempDataDir(async (dir) => {
        const r = renderNote('s1');
        await focusAndPressB(r);
        const frame = await pollUntil(r.lastFrame, (f) => f.includes('Blog token'));
        expect(frame).toContain('Blog token');
        expect(frame).not.toContain('Skryf token');
        await delay(100);
        r.stdin.write('tok2\r');
        await pollUntil(r.lastFrame, (f) => f.includes(SEND));
        const config = await loadBlogConfig(dir);
        expect(config?.origin).toBe('https://blog.example');
        r.unmount();
      });
    } finally {
      if (prevOrigin === undefined) delete process.env.SNOTE_BLOG_ORIGIN;
      else process.env.SNOTE_BLOG_ORIGIN = prevOrigin;
    }
  }, 10000);

  it('4: WHEN `blogOriginFromEnv({})` and `blogOriginFromEnv({ SNOTE_BLOG_ORIGIN: \'\' })` are called THEN both return `https://skryf.art`', () => {
    expect(blogOriginFromEnv({})).toBe('https://skryf.art');
    expect(blogOriginFromEnv({ SNOTE_BLOG_ORIGIN: '' })).toBe('https://skryf.art');
  });
});
