/**
 * T446 — error scenarios at the UI edge: a note removed on the server while
 * selected or unselected, a completely empty account, tiny terminal sizes,
 * and pathologically large notes. Tests only; no product code changes.
 *
 * Sync idiom: test/integration/offline.test.ts:62-73 (token `test-token`,
 * username `test@example.com`). Remote removal: server.serverRemove
 * (test/fake-simperium/server.ts:1029). Resize idiom:
 * test/tui/resize.test.tsx:20-60 plus a `rows` getter like its `columns`
 * override. Every awaited value is asserted inside the poll (vi.waitFor via
 * test/helpers/ink-waits), never after a fixed sleep.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { Root } from '../../src/tui/Root';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

const appId = 'test-app';
const eid = (id: string): EntityId => id as unknown as EntityId;
const divider = '│';

const stripAnsi = (s: string | undefined): string =>
  (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll every 50 ms (offline.test.ts:29); last = the final true reading. */
async function pollUntil(cond: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  let last = false;
  while (Date.now() < end) {
    last = cond();
    if (last) return true;
    await sleep(50);
  }
  return last;
}

/** The frame row that starts with the selection marker. */
const markerRow = (frame: string): string => {
  const line = stripAnsi(frame).split('\n').find((l) => l.startsWith('>'));
  if (line === undefined) throw new Error('no frame row starts with >');
  return line;
};

const noteData = (content: string, modificationDate: number) => ({
  content,
  creationDate: 1_000,
  modificationDate,
  deleted: 0,
  systemTags: [],
  tags: [],
});

describe('T446 remote removal, empty account, tiny sizes, huge notes', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(async () => {
    // Let in-flight sync settle, then stop the server (offline.test.ts:59-64).
    await sleep(100);
    server.stop();
  });

  const seedNotes = (): void => {
    server.seedBucket(appId, 'note', [
      { id: 'n1', data: noteData('Note n1', 4_000), version: 1 },
      { id: 'n2', data: noteData('Note n2', 3_000), version: 1 },
      { id: 'n3', data: noteData('Note n3', 2_000), version: 1 },
      { id: 'n4', data: noteData('Note n4', 1_000), version: 1 },
    ]);
  };

  const makeSyncedStore = async (): Promise<ReturnType<typeof makeStore>> => {
    const store = makeStore({
      sync: {
        appId,
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });
    await waitForNotes(store, 2500);
    return store;
  };

  it('1: WHEN 4 synced notes n1..n4 render at width 100, `j` is pressed 3 times and n4 is removed on the server THEN within 2 s `data.notes.size` is `3` and the frame row starting with `>` contains `Note n3`', async () => {
    seedNotes();
    const store = await makeSyncedStore();
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={100} height={24} />
    );
    await waitForInput(stdin);

    // The four rows in display order: n1 (date 4000) .. n4 (date 1000).
    await waitForFrame(
      lastFrame,
      (f) => ['Note n1', 'Note n2', 'Note n3', 'Note n4'].every((t) => stripAnsi(f).includes(t)),
    );

    // j 30 ms apart (test/tui/selection.test.tsx:60): marker onto Note n4.
    for (let i = 0; i < 3; i++) {
      stdin.write('j');
      await sleep(30);
    }
    await waitForFrame(lastFrame, (f) => markerRow(f).includes('Note n4'));

    server.serverRemove('note', 'n4');

    // Every asserted value is read inside the polling condition.
    let ok = false;
    await vi.waitFor(
      () => {
        const f = lastFrame() ?? '';
        ok =
          store.getState().data.notes.size === 3 &&
          markerRow(f).includes('Note n3');
        if (!ok) throw new Error('removal not reflected yet');
      },
      { timeout: 2000, interval: 20 },
    );
    expect(ok).toBe(true);

    store.stopSync!();
    unmount();
  });

  it('2: WHEN the first row is selected, n1 is removed on the server and then `d` is pressed THEN the row starting with `>` contains `Note n2`, within 1 s n2\'s `deleted` is `true`, and n3 and n4 are not deleted', async () => {
    seedNotes();
    const store = await makeSyncedStore();
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={100} height={24} />
    );
    await waitForInput(stdin);

    // First row selected by default: n1, the newest.
    await waitForFrame(lastFrame, (f) => markerRow(f).includes('Note n1'));

    server.serverRemove('note', 'n1');
    await waitForFrame(
      lastFrame,
      (f) => store.getState().data.notes.size === 3 && markerRow(f).includes('Note n2'),
    );

    stdin.write('d');

    // Trash lands on n2, and only n2, inside the same polling condition.
    let ok = false;
    await vi.waitFor(
      () => {
        const notes = store.getState().data.notes;
        ok =
          markerRow(lastFrame() ?? '').includes('Note n2') &&
          notes.get(eid('n2'))?.deleted === true &&
          notes.get(eid('n3'))?.deleted !== true &&
          notes.get(eid('n4'))?.deleted !== true;
        if (!ok) throw new Error('d did not trash n2 alone yet');
      },
      { timeout: 1000, interval: 20 },
    );
    expect(ok).toBe(true);

    store.stopSync!();
    unmount();
  });

  it('3: WHEN the server holds 0 notes and the App has connected THEN the frame contains `0 notes` and `Select a note to preview`; after d, e, Enter, h, p, y, w, i, x the store holds `0` notes and the server got `0` `:c:` frames', async () => {
    // No seedBucket: the server holds nothing. waitForNotes would time out
    // on an empty account, so wait for the connection and the empty index.
    const store = makeStore({
      sync: {
        appId,
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });
    const client = store.client as { buckets?: unknown[] } | undefined;
    await vi.waitFor(
      () => {
        if (!store.getState().simperium.connected) throw new Error('not connected yet');
        if (!client?.buckets) throw new Error('client buckets not built yet');
      },
      { timeout: 2000, interval: 20 },
    );

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={100} height={12} />
    );
    await waitForInput(stdin);

    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('0 notes') && f.includes('Select a note to preview'),
    );
    expect(frame).toContain('0 notes');
    expect(frame).toContain('Select a note to preview');

    for (const key of ['d', 'e', '\r', 'h', 'p', 'y', 'w', 'i', 'x']) {
      stdin.write(key);
      await sleep(30);
    }

    // Settle window: any key that dispatched a change would have sent by now
    // (noteEditDelayMs is 10). Everything is read inside the poll condition.
    await sleep(300);
    let ok = false;
    await vi.waitFor(
      () => {
        const changeFrames = server.received.filter((m) => m.includes(':c:')).length;
        ok = store.getState().data.notes.size === 0 && changeFrames === 0;
        if (!ok) {
          throw new Error(
            `store holds ${store.getState().data.notes.size} notes, ` +
              `${server.received.filter((m) => m.includes(':c:')).length} :c: frames`
          );
        }
      },
      { timeout: 1000, interval: 20 },
    );
    expect(ok).toBe(true);

    store.stopSync!();
    unmount();
  });

  it('4: WHEN Root at 120x32 is resized to 20x5 and then to 10x3 THEN each frame has at most 5 and 3 lines with no line longer than 20 and 10, and after resizing back to 120x32 the frame contains `│` within 1 s', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-err-resize-'));
    try {
      await saveToken(dir, { email: 'a@b.co', token: 'tok' });
      const seedStore = makeStore({ stubClient: {} });
      seedStore.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: 'n1' as never,
        note: { content: 'First note', systemTags: [], tags: [] },
      });
      seedStore.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: 'n2' as never,
        note: { content: 'Second note', systemTags: [], tags: [] },
      });
      const makeStoreFor = vi.fn(() => seedStore as Store<State>);
      const requestCode = vi.fn().mockResolvedValue(undefined);
      const completeLogin = vi.fn().mockResolvedValue('tok');

      const { lastFrame, stdout, unmount } = render(
        <Root
          dataDir={dir}
          width={120}
          height={32}
          makeStoreFor={makeStoreFor}
          requestCode={requestCode}
          completeLogin={completeLogin}
        />
      );

      const setSize = (columns: number, rows: number) => {
        Object.defineProperty(stdout, 'columns', { get: () => columns, configurable: true });
        Object.defineProperty(stdout, 'rows', { get: () => rows, configurable: true });
        stdout.emit('resize');
      };
      const frameFits = (maxLines: number, maxWidth: number): boolean => {
        const f = lastFrame();
        if (!f) return false;
        const lines = f.split('\n');
        return lines.length <= maxLines && lines.every((l) => l.length <= maxWidth);
      };

      await waitForFrame(lastFrame, (f) => f.includes(divider));
      expect(lastFrame()!.split('\n').length).toBe(32);

      setSize(20, 5);
      await waitForFrame(lastFrame, (f) => frameFits(5, 20));
      expect(lastFrame()!.split('\n').length).toBeLessThanOrEqual(5);

      setSize(10, 3);
      await waitForFrame(lastFrame, (f) => frameFits(3, 10));
      expect(lastFrame()!.split('\n').length).toBeLessThanOrEqual(3);

      setSize(120, 32);
      const back = await waitForFrame(lastFrame, (f) => f.includes(divider), 1000);
      expect(back).toContain('│');

      unmount();
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('5: WHEN a 1,000,000-character one-line note and a 50,000-line note render at 100x24 THEN within 1 s the frame has exactly `24` lines, and after `j` the row starting with `>` holds the other note within 1 s', async () => {
    const store = makeStore({ stubClient: {} });
    const bigOneLine = 'x'.repeat(1_000_000);
    const bigManyLines = Array.from({ length: 50_000 }, (_, i) => `line ${i}`).join('\n');
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('big-one'),
      note: {
        content: `Huge oneline\n${bigOneLine}`,
        systemTags: [],
        tags: [],
        creationDate: 1_000,
        modificationDate: 2_000,
      },
    });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('big-many'),
      note: {
        content: `Huge manylines\n${bigManyLines}`,
        systemTags: [],
        tags: [],
        creationDate: 1_000,
        modificationDate: 1_000,
      },
    });

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={100} height={24} />
    );

    // Everything asserted is read inside the polling condition: the huge
    // notes rendered into exactly 24 lines with both titles on screen, and
    // once 'j' lands the one `>` row holds the other note.
    let ok = false;
    await vi.waitFor(
      () => {
        const f = stripAnsi(lastFrame() ?? '');
        const lines = f.split('\n');
        const markerRows = lines.filter((l) => l.startsWith('>'));
        ok =
          lines.length === 24 &&
          f.includes('Huge oneline') &&
          f.includes('Huge manylines') &&
          markerRows.length === 1 &&
          markerRows[0].includes('Huge oneline');
        if (!ok) throw new Error(`${lines.length} lines, markers ${JSON.stringify(markerRows)}`);
      },
      { timeout: 1000, interval: 10 },
    );
    expect(ok).toBe(true);

    // waitForInput resolves once Ink attached its stdin listener, which can
    // be before React's first commit; the frame above proves the tree is
    // up. 'j' moves the `>` row from the newest note to the other one.
    await waitForInput(stdin);
    stdin.write('j');
    await vi.waitFor(
      () => {
        const f = stripAnsi(lastFrame() ?? '');
        const markerRows = f.split('\n').filter((l) => l.startsWith('>'));
        ok =
          f.split('\n').length === 24 &&
          markerRows.length === 1 &&
          markerRows[0].includes('Huge manylines');
        if (!ok) throw new Error(`marker rows after j: ${JSON.stringify(markerRows)}`);
      },
      { timeout: 1000, interval: 10 },
    );
    expect(ok).toBe(true);

    unmount();
  });
});
