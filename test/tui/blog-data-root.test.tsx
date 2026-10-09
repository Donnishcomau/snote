/**
 * T408: the blog status line and the blog prompt use the data directory
 * snote was started with. src/core/data-root.ts holds the root main()
 * resolved; BottomArea's `Sent as draft` line and the blog send prompt
 * (blog-send-ask, blog-send-dialog) read/write blog.json and
 * blog-sent.json there instead of re-deriving defaultDataDir().
 */

import { afterEach, describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import type { Note } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { recordBlogSend } from '../../src/core/blog-sent';
import { defaultDataDir } from '../../src/core/token';
import { dataRoot, setDataRoot } from '../../src/core/data-root';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const A_URL = 'https://a.example/w/1';
const DEFAULT_URL = 'https://default.example/w/1';

// Every value an assertion needs comes from the frame the poll returns,
// so the poll and the assertion share one source.
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

// base owns XDG_DATA_HOME, so defaultDataDir() is dir. A is a second,
// separate root reached only through setDataRoot.
function withRoots(run: (dir: string, a: string) => Promise<void>): () => Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'blog-data-root-'));
  const dir = join(base, 'snote');
  const a = join(base, 'a');
  mkdirSync(dir, { recursive: true });
  mkdirSync(a, { recursive: true });
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  return async () => {
    try {
      await run(dir, a);
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
      rmSync(base, { recursive: true, force: true });
    }
  };
}

function importNote(store: ReturnType<typeof makeStore>, noteId: string, content: string): void {
  const note: Note = {
    content,
    tags: [],
    systemTags: [],
    deleted: false,
    creationDate: 1000,
    modificationDate: 1000,
  } as never;
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: noteId as never, note: note as never });
}

// One selected note, note pane focused (Tab), `b` opens the blog prompt.
async function renderNoteWithB(noteId: string): Promise<ReturnType<typeof render>> {
  const store = makeStore({ stubClient: {} });
  importNote(store, noteId, 'Hello from the note');
  const r = render(<App store={store} width={80} height={24} />);
  await delay(50);
  r.stdin.write('\t');
  await delay(50);
  r.stdin.write('b');
  return r;
}

afterEach(() => {
  setDataRoot(null);
});

describe('blog data root (T408)', () => {
  it('1: WHEN `setDataRoot(A)` ran for a temp dir A, A\'s blog-sent.json has a record for `s1` with url `https://a.example/w/1`, and the one in `defaultDataDir()` has url `https://default.example/w/1` for `s1` THEN the App frame with s1 selected contains `https://a.example/w/1` and not `https://default.example/w/1`', async () => {
    await withRoots(async (dir, a) => {
      recordBlogSend(a, 's1', { postId: 'p1', url: A_URL, sentAt: '2026-09-28T00:00:00.000Z' });
      recordBlogSend(dir, 's1', { postId: 'p2', url: DEFAULT_URL, sentAt: '2026-09-27T00:00:00.000Z' });
      setDataRoot(a);
      const store = makeStore({ stubClient: {} });
      importNote(store, 's1', 'Note with a send record');
      const r = render(<App store={store} width={80} height={24} />);
      const frame = await pollUntil(
        r.lastFrame,
        (f) => f.includes('Sent as draft') && f.includes('https://a.example/w/1'),
      );
      expect(frame).toContain('https://a.example/w/1');
      expect(frame).not.toContain('https://default.example/w/1');
      r.unmount();
    });
  });

  it('2: WHEN `setDataRoot(null)` then runs THEN `dataRoot()` equals `defaultDataDir()` and a new App frame contains `https://default.example/w/1`', async () => {
    await withRoots(async (dir, a) => {
      recordBlogSend(a, 's1', { postId: 'p1', url: A_URL, sentAt: '2026-09-28T00:00:00.000Z' });
      recordBlogSend(dir, 's1', { postId: 'p2', url: DEFAULT_URL, sentAt: '2026-09-27T00:00:00.000Z' });
      setDataRoot(a);
      setDataRoot(null);
      expect(dataRoot()).toBe(defaultDataDir());
      const store = makeStore({ stubClient: {} });
      importNote(store, 's1', 'Note with a send record');
      const r = render(<App store={store} width={80} height={24} />);
      const frame = await pollUntil(
        r.lastFrame,
        (f) => f.includes('Sent as draft') && f.includes('https://default.example/w/1'),
      );
      expect(frame).toContain('https://default.example/w/1');
      r.unmount();
    });
  });

  it('3: WHEN `setDataRoot(A)` ran, A has a blog.json for origin `https://blog.example`, `defaultDataDir()` has none, and `b` is written THEN the frame contains `Send this note to your blog as a draft?` and does not contain `token`', async () => {
    await withRoots(async (dir, a) => {
      writeFileSync(join(a, 'blog.json'), JSON.stringify({ origin: 'https://blog.example', token: 't0' }));
      expect(existsSync(join(dir, 'blog.json'))).toBe(false);
      setDataRoot(a);
      const r = await renderNoteWithB('s1');
      const frame = await pollUntil(
        r.lastFrame,
        (f) => f.includes('Send this note to your blog as a draft?'),
      );
      expect(frame).toContain('Send this note to your blog as a draft?');
      expect(frame.toLowerCase()).not.toContain('token');
      r.unmount();
    });
  });

  it('4: WHEN src/cli/main.tsx is read THEN `setDataRoot(dataDir)` comes after `const dataDir = o.dataDir ?? defaultDataDir();` and before `const { waitUntilExit, unmount, clear } = render(`, and none of BottomArea.tsx, blog-send-ask.ts and blog-send-dialog.tsx contains `defaultDataDir`', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), 'src', ...p.split('/')), 'utf8');
    const main = read('cli/main.tsx');
    const decl = main.indexOf('const dataDir = o.dataDir ?? defaultDataDir();');
    const set = main.indexOf('setDataRoot(dataDir)');
    const renderLine = main.indexOf('const { waitUntilExit, unmount, clear } = render(');
    expect(decl).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(decl);
    expect(renderLine).toBeGreaterThan(set);
    for (const p of ['tui/BottomArea.tsx', 'tui/blog-send-ask.ts', 'tui/blog-send-dialog.tsx']) {
      expect(read(p)).not.toContain('defaultDataDir');
    }
  });
});
