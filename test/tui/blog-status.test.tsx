/**
 * T333: Show a sent-as-draft line for a note that was posted.
 */

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import type { EntityId, Note } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { blogStatusLine, recordBlogSend } from '../../src/core/blog-sent';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

async function withTempDataDir(run: (dir: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'blog-status-'));
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

describe('blog status line (T333)', () => {
  it('1: WHEN `blogStatusLine` is called with sentAt `2026-09-28T00:00:00.000Z` and url `https://blog.example/write/p1` THEN it returns `Sent as draft · 2026-09-28 · https://blog.example/write/p1`', () => {
    const res = blogStatusLine({
      sentAt: '2026-09-28T00:00:00.000Z',
      url: 'https://blog.example/write/p1',
    });
    expect(res).toBe('Sent as draft · 2026-09-28 · https://blog.example/write/p1');
  });

  it('2: WHEN the selected note has that send record THEN the frame contains `Sent as draft · 2026-09-28 · https://blog.example/write/p1`', async () => {
    await withTempDataDir(async (dir) => {
      recordBlogSend(dir, 's1', {
        postId: 'p1',
        url: 'https://blog.example/write/p1',
        sentAt: '2026-09-28T00:00:00.000Z',
      });
      const store = makeStore({ stubClient: {} });
      const note: Note = {
        content: 'Note with send record',
        tags: [],
        systemTags: ['pinned'],
        deleted: false,
        creationDate: 1000,
        modificationDate: 1000,
      } as never;
      store.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: 's1' as never,
        note: note as never,
      });
      const r = render(<App store={store} width={80} height={24} />);
      await delay(50);
      expect(stripAnsi(r.lastFrame())).toContain('Sent as draft · 2026-09-28 · https://blog.example/write/p1');
      r.unmount();
    });
  });

  it('3: WHEN the selected note has no send record THEN the frame does not contain `Sent as draft`', async () => {
    await withTempDataDir(async () => {
      const store = makeStore({ stubClient: {} });
      store.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: 's2' as never,
        note: {
          content: 'Note without send record',
          tags: [],
          systemTags: [],
          deleted: false,
          creationDate: 1000,
          modificationDate: 1000,
        } as never,
      });
      const r = render(<App store={store} width={80} height={24} />);
      await delay(50);
      expect(stripAnsi(r.lastFrame())).not.toContain('Sent as draft');
      r.unmount();
    });
  });

  it("4: WHEN the status line is shown THEN the note's `systemTags` array is the same array as before the render", async () => {
    await withTempDataDir(async (dir) => {
      recordBlogSend(dir, 's3', {
        postId: 'p1',
        url: 'https://blog.example/write/p1',
        sentAt: '2026-09-28T00:00:00.000Z',
      });
      const tagsArray: string[] = ['pinned'];
      const store = makeStore({ stubClient: {} });
      const note: Note = {
        content: 'Check system tags',
        tags: [],
        systemTags: tagsArray,
        deleted: false,
        creationDate: 1000,
        modificationDate: 1000,
      } as never;
      store.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: 's3' as never,
        note: note as never,
      });
      const r = render(<App store={store} width={80} height={24} />);
      await delay(50);
      expect(stripAnsi(r.lastFrame())).toContain('Sent as draft · 2026-09-28 · https://blog.example/write/p1');
      const currentNote = store.getState().data.notes.get('s3' as EntityId) as Note;
      expect(currentNote.systemTags).toBe(tagsArray);
      r.unmount();
    });
  });
});
