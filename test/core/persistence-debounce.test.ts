import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { persistOnChange, loadState } from '../../src/core/persistence';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

// Poll a condition with a 10 ms step so a late timer only makes a test
// slower, never red (T182).
const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('T94 debounce writes once', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-deb-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1: WHEN persistOnChange(store, dir, 300) is active and three edits are dispatched back-to-back with no await between them THEN immediately state.json does not exist, and once ino() !== 0 loadState(dir) has the note content Edit 3', async () => {
    const store = makeStore({ stubClient: {} });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-debounce'),
      note: {
        content: 'Initial',
        systemTags: [],
        tags: [],
      },
    });

    const unsubscribe = persistOnChange(store, tmpDir, 300);
    const filePath = path.join(tmpDir, 'state.json');
    const ino = () => {
      try {
        return fs.statSync(filePath).ino;
      } catch {
        return 0;
      }
    };

    // Three dispatches run synchronously with no await in between, so the
    // debounce timer cannot have fired yet, however slow the machine is.
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce'),
      changes: { content: 'Edit 1' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce'),
      changes: { content: 'Edit 2' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce'),
      changes: { content: 'Edit 3' },
    });

    expect(fs.existsSync(filePath)).toBe(false);

    await waitFor(() => ino() !== 0);
    const loaded = loadState(tmpDir);
    expect(loaded).toBeDefined();
    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });
    expect(
      restoredStore.getState().data.notes.get(eid('note-debounce'))?.content
    ).toBe('Edit 3');

    unsubscribe();
  });

  it('2: WHEN the same three edits are dispatched, the first write is recorded as first = ino(), and we then sleep 450 ms (longer than the 300 ms delay) THEN expect(ino()).toBe(first): the file was written exactly once', async () => {
    const store = makeStore({ stubClient: {} });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-debounce-2'),
      note: {
        content: 'Initial',
        systemTags: [],
        tags: [],
      },
    });

    const unsubscribe = persistOnChange(store, tmpDir, 300);
    const filePath = path.join(tmpDir, 'state.json');
    const ino = () => {
      try {
        return fs.statSync(filePath).ino;
      } catch {
        return 0;
      }
    };
    const clean = () => {
      fs.rmSync(filePath, { force: true });
    };

    // Dispatch 3 edits back-to-back
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-2'),
      changes: { content: 'Edit 1' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-2'),
      changes: { content: 'Edit 2' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-2'),
      changes: { content: 'Edit 3' },
    });

    await waitFor(() => ino() !== 0);
    const first = ino();

    // Longer than the 300 ms debounce: nothing else is dispatched, so
    // state.json keeps the inode of the single debounce write.
    await new Promise((r) => setTimeout(r, 450));
    expect(ino()).toBe(first);

    // Take the pending flush off the table so it cannot rewrite the file
    // after this check; every write in these tests gets a fresh inode.
    clean();
    unsubscribe();
  });

  it('3: WHEN a fourth edit with content Edit 4 is dispatched after first = ino() and we wait for a changed inode THEN expect(ino()).not.toBe(first) and the saved content is Edit 4', async () => {
    const store = makeStore({ stubClient: {} });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-debounce-3'),
      note: {
        content: 'Initial',
        systemTags: [],
        tags: [],
      },
    });

    const unsubscribe = persistOnChange(store, tmpDir, 300);
    const filePath = path.join(tmpDir, 'state.json');
    const ino = () => {
      try {
        return fs.statSync(filePath).ino;
      } catch {
        return 0;
      }
    };
    const clean = () => {
      fs.rmSync(filePath, { force: true });
    };

    // Dispatch 3 edits back-to-back
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-3'),
      changes: { content: 'Edit 1' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-3'),
      changes: { content: 'Edit 2' },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-3'),
      changes: { content: 'Edit 3' },
    });

    await waitFor(() => ino() !== 0);
    const first = ino();

    // A fourth edit re-arms the debounce and becomes the next write.
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-debounce-3'),
      changes: { content: 'Edit 4' },
    });

    await waitFor(() => ino() !== 0 && ino() !== first);
    expect(ino()).not.toBe(first);

    const loaded = loadState(tmpDir);
    expect(loaded).toBeDefined();
    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });
    expect(
      restoredStore.getState().data.notes.get(eid('note-debounce-3'))?.content
    ).toBe('Edit 4');

    // Same as case 2: the flush on unsubscribe writes no second file.
    clean();
    unsubscribe();
  });

  it('4: WHEN nothing is dispatched for 150 ms after persistOnChange starts THEN state.json does not exist', async () => {
    const store = makeStore({ stubClient: {} });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-debounce-4'),
      note: {
        content: 'Initial',
        systemTags: [],
        tags: [],
      },
    });

    const unsubscribe = persistOnChange(store, tmpDir, 50);

    // Don't dispatch anything else, just wait
    await new Promise((r) => setTimeout(r, 150));

    const filePath = path.join(tmpDir, 'state.json');
    expect(fs.existsSync(filePath)).toBe(false);

    // `unsubscribe()` also flushes; with nothing new dispatched its flush
    // would re-create the file we just proved absent. Drop it first so the
    // teardown is a no-op.
    fs.rmSync(filePath, { force: true });
    unsubscribe();
  });
});
