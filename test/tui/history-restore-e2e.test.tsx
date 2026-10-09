/**
 * T447 History restore driven by keys against the fake server, and `y`
 * through the real clipboard writer.
 *
 * Tests 1-3: the App is rendered over a store syncing to the fake Simperium
 * server (setup copied from test/integration/history.test.ts) and driven
 * with real keystrokes: h lists the versions, h,j,j,Enter restores v1 on
 * the server, h,j,Escape changes nothing.
 *
 * Tests 4-5: with no `copyText` prop the App reaches the real clipboard
 * writer (src/core/clipboard.ts -> `wl-copy`). A fake `wl-copy` in a temp
 * dir put first on PATH captures the stdin (or fails), never the real one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { ActionType } from '@vendor/state/action-types';
import { App } from '../../src/tui/App';
import { resetKeyLog } from '../../src/tui/key-ring';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const appId = 'test-app';
const token = 'test-token';
const username = 'test@example.com';

const now = Math.floor(Date.now() / 1000);

/** Poll cond up to 40 times, 50 ms apart (~2 s). */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
}

const serverVersion = (id: string): number =>
  server.getObject(appId, 'note', id)?.version ?? -1;

const serverContent = (id: string): unknown =>
  server.getObject(appId, 'note', id)?.data.content;

type SyncStore = Store<State, ActionType> & {
  stopSync?: () => void;
  forceSync?: () => void;
};

let server: FakeSimperiumServer;

beforeEach(async () => {
  server = new FakeSimperiumServer();
  await server.start();
});

afterEach(async () => {
  // Clean up: let in-flight messages settle, then stop the server (100 ms, as in history.test.ts)
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      server.stop();
      resolve();
    }, 100);
  });
});

/**
 * Seed two notes, connect a store, edit note1 twice so the server holds
 * versions 1 (First draft), 2 (Second draft) and 3 (Third draft).
 */
async function makeHistory(): Promise<{ store: SyncStore }> {
  server.seedBucket(appId, 'note', [
    {
      id: 'note1',
      data: {
        content: 'First draft',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
      version: 1,
    },
    {
      id: 'note2',
      data: {
        content: 'Other note',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
      version: 1,
    },
  ]);

  const store = makeStore({
    sync: {
      appId,
      token,
      username,
      clientOptions: { url: server.url },
      noteEditDelayMs: 10, // fast debounce for tests
    },
  }) as SyncStore;

  await waitForNotes(store, 2500);

  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: 'note1' as never,
    changes: { content: 'Second draft' },
  });
  await until(() => serverVersion('note1') === 2);

  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: 'note1' as never,
    changes: { content: 'Third draft' },
  });
  await until(() => serverVersion('note1') === 3);

  // The client must have stored the acknowledgement before it is asked for revisions
  await new Promise((r) => setTimeout(r, 150));

  return { store };
}

describe('T447 history restore by keys against the fake server, y through the real clipboard writer', () => {
  // key-ring and --new-request cells are module state shared inside the
  // vitest worker; a paste ringed in an earlier test (e.g. a bare ESC in
  // history-key.test.tsx) would mask this file's keystrokes otherwise.
  beforeEach(() => {
    resetKeyLog();
    delete process.env.SNOTE_ON_NEW_REQUEST;
  });

  /**
   * Wait until the rendered list shows the selected note, then write `h`
   * and wait until the store says the note is open with the revisions
   * pane shown. No ESC drain: a bare ESC is a keystroke the App handles,
   * and resetKeyLog() before the render already cleared the ring.
   *
   * note1 has the newest modificationDate, so while the revisions pane is
   * up it occupies row 0 (historyIndex 0) and row 1 (historyIndex 1): row
   * 1 reads "Second..", which only exists while the history is rendered.
   * If `h` is ever swallowed, the NoteList shows note1 as ">Third dra..",
   * which never contains "Second.." and this wait fails loudly.
   */
  async function waitHistoryReachesApp(
    stdin: { listenerCount(e: string): number; write(s: string): void },
    lastFrame: () => string | undefined,
    store: Store<State, ActionType>
  ): Promise<void> {
    await waitForInput(stdin);
    // makeHistory left note1 at Third draft; that is the selected row when the list renders
    await waitForFrame(lastFrame, '>Third draft');
    stdin.write('h');
    await vi.waitFor(
      () => {
        const st = store.getState();
        expect(st.ui.openedNote).toBe('note1');
        expect(st.ui.showRevisions).toBe(true);
        expect(lastFrame() ?? '').toContain('Second..');
      },
      { timeout: 2000, interval: 10 }
    );
  }

  it('1: WHEN note1 has server revisions up to v3 and `h` is written in the App THEN within 1 s the frame contains `>v3`, `Third draft` and `First draft`', async () => {
    const { store } = await makeHistory();
    try {
      const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
      await waitHistoryReachesApp(stdin, lastFrame, store);

      const frame = await waitForFrame(
        lastFrame,
        (f) => f.includes('>v3') && f.includes('Third ..') && f.includes('First ..'),
        1000
      );
      expect(frame).toContain('>v3');
      expect(frame).toContain('Third ..');
      expect(frame).toContain('First ..');
    } finally {
      store.stopSync?.();
    }
  });

  it('2: WHEN `h`, `j`, `j`, Enter are written THEN within 2 s the server note1 has version `4` and content `First draft`, the store note1 content is `First draft` and `ui.showRevisions` is `false`', async () => {
    const { store } = await makeHistory();
    try {
      const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
      await waitHistoryReachesApp(stdin, lastFrame, store);

      // Both j go to v1 before Enter: the history rows clip at 33 columns,
      // so titles show as "First .."; the full title lives in the preview.
      stdin.write('j');
      stdin.write('j');
      await waitForFrame(
        lastFrame,
        (f) => f.includes('>v1') && f.includes('First ..') && f.includes('Third ..'),
        1000
      );

      stdin.write('\r');
      await vi.waitFor(
        () => {
          const st = store.getState();
          expect(serverVersion('note1')).toBe(4);
          expect(serverContent('note1')).toBe('First draft');
          expect(st.data.notes.get(eid('note1'))?.content).toBe('First draft');
          expect(st.ui.showRevisions).toBe(false);
        },
        { timeout: 2000, interval: 20 }
      );

      expect(serverVersion('note1')).toBe(4);
      expect(serverContent('note1')).toBe('First draft');
      expect(store.getState().data.notes.get(eid('note1'))?.content).toBe('First draft');
      expect(store.getState().ui.showRevisions).toBe(false);
    } finally {
      store.stopSync?.();
    }
  });

  it('3: WHEN `h`, `j`, Escape are written THEN after 300 ms the server note1 still has version `3` and content `Third draft`', async () => {
    const { store } = await makeHistory();
    try {
      const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
      await waitHistoryReachesApp(stdin, lastFrame, store);

      // The move lands before Escape: at v2 the row reads >v2 while the
      // v3 row still shows Third .. (rows clip at 33 columns).
      stdin.write('j');
      await waitForFrame(
        lastFrame,
        (f) => f.includes('>v2') && f.includes('Third ..'),
        1000
      );

      stdin.write('\x1b');
      await waitForFrame(lastFrame, (f) => !f.includes('History'), 1000);

      await new Promise((r) => setTimeout(r, 300));
      expect(serverVersion('note1')).toBe(3);
      expect(serverContent('note1')).toBe('Third draft');
    } finally {
      store.stopSync?.();
    }
  });
});

describe('T447 y through the real clipboard writer (fake wl-copy first on PATH)', () => {
  const savedPath = process.env.PATH;

  /** Write an executable fake `wl-copy` into a fresh temp dir, first on PATH. */
  function installFakeWlCopy(body: string): string {
    const bin = mkdtempSync(join(tmpdir(), 'wl-copy-'));
    const script = join(bin, 'wl-copy');
    writeFileSync(script, body, 'utf-8');
    chmodSync(script, 0o755);
    process.env.PATH = `${bin}:${savedPath}`;
    return bin;
  }

  function publishedStore(): ReturnType<typeof makeStore> {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-pub'),
      note: {
        content: 'Public note',
        systemTags: ['published'],
        tags: [],
        deleted: false,
        modificationDate: 1000,
        creationDate: 1000,
        publishURL: 'abc123',
      },
    });
    return store;
  }

  afterEach(() => {
    process.env.PATH = savedPath;
  });

  it('4: WHEN a published note renders with no `copyText` prop, a fake `wl-copy` saving its stdin is first on PATH and `y` is written THEN within 1 s the saved text is `https://simp.ly/p/abc123` and the frame contains `(copied)`', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'wl-copy-out-'));
    const outFile = join(outDir, 'saved');
    const bin = installFakeWlCopy(`#!/bin/sh\ncat > ${outFile}\nexit 0\n`);
    try {
      const store = publishedStore();
      const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
      await waitForInput(stdin);
      await waitForFrame(lastFrame, '>Public note');

      stdin.write('y');
      // EVERY asserted value is inside the poll: the saved text (once the
      // fake wl-copy has flushed) and the (copied) badge on the same frame.
      const frame = await waitForFrame(
        lastFrame,
        (f) =>
          f.includes('(copied)') &&
          existsSync(outFile) &&
          readFileSync(outFile, 'utf-8') === 'https://simp.ly/p/abc123',
        1000
      );

      expect(frame).toContain('(copied)');
      expect(readFileSync(outFile, 'utf-8')).toBe('https://simp.ly/p/abc123');
    } finally {
      rmSync(bin, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('5: WHEN the same runs with a fake `wl-copy` that exits 1 THEN within 1 s the frame contains `(copy failed)` and `data.notes` is the same Map as before (`toBe`)', async () => {
    const bin = installFakeWlCopy('#!/bin/sh\ncat > /dev/null\nexit 1\n');
    try {
      const store = publishedStore();
      const notesBefore = store.getState().data.notes;

      const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
      await waitForInput(stdin);
      await waitForFrame(lastFrame, '>Public note');

      const notesAtRender = store.getState().data.notes;
      expect(notesAtRender).toBe(notesBefore);

      stdin.write('y');
      const frame = await waitForFrame(lastFrame, '(copy failed)', 1000);

      expect(frame).toContain('(copy failed)');
      expect(store.getState().data.notes).toBe(notesBefore);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
