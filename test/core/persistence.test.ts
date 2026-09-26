import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi, expectTypeOf } from 'vitest';

import { makeStore } from '../../src/core/store';
import { saveState, loadState, persistOnChange } from '../../src/core/persistence';
import type { EntityId, TagName } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;
const tagHash = (name: string): string => name as unknown as string;

describe('persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-persist-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1: saveState + loadState round-trips notes and noteTags as proper types', () => {
    const store = makeStore({ stubClient: {} });

    // Create 2 notes, one with tags
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-1'),
      note: {
        content: 'First note',
        systemTags: [],
        tags: [],
      },
    });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-2'),
      note: {
        content: 'Second note',
        systemTags: [],
        tags: [tname('work')],
      },
    });

    saveState(store.getState(), tmpDir);

    const loaded = loadState(tmpDir);
    expect(loaded).toBeDefined();

    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });

    const state = restoredStore.getState();
    const notes = state.data.notes;

    expect(notes instanceof Map).toBe(true);
    expect(notes.size).toBe(2);
    expect(notes.get(eid('note-1'))?.content).toBe('First note');
    expect(notes.get(eid('note-2'))?.content).toBe('Second note');

    // noteTags values should be Sets
    const noteTags = state.data.noteTags;
    expect(noteTags instanceof Map).toBe(true);
    for (const [, value] of noteTags) {
      expect(value instanceof Set).toBe(true);
    }
  });

  it('2: loadState on an empty dir returns undefined', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-persist-empty-'));
    try {
      const result = loadState(emptyDir);
      expect(result).toBeUndefined();
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('3: loadState with invalid JSON returns undefined without throwing', () => {
    const filePath = path.join(tmpDir, 'state.json');
    fs.writeFileSync(filePath, 'not json');

    const result = loadState(tmpDir);
    expect(result).toBeUndefined();
  });

  it('4: persistOnChange debounces and writes state.json once', async () => {
    const store = makeStore({ stubClient: {} });

    // Create a note
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-debounce'),
      note: {
        content: 'Debounce test',
        systemTags: [],
        tags: [],
      },
    });

    const unsubscribe = persistOnChange(store, tmpDir, 50);

    // Dispatch 3 actions within 10 ms
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

    // Wait for debounce to fire (150 ms > 50 ms debounce)
    await new Promise((r) => setTimeout(r, 150));

    // state.json should exist and .tmp should not
    const filePath = path.join(tmpDir, 'state.json');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);

    unsubscribe();
  });

  it('5: unsubscribe flushes immediately', () => {
    const store = makeStore({ stubClient: {} });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-unsub'),
      note: {
        content: 'Unsubscribe flush test',
        systemTags: [],
        tags: [],
      },
    });

    const unsubscribe = persistOnChange(store, tmpDir, 5000); // long delay

    // Dispatch another action
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-unsub'),
      changes: { content: 'After subscribe' },
    });

    // Unsubscribe should flush immediately
    unsubscribe();

    const filePath = path.join(tmpDir, 'state.json');
    expect(fs.existsSync(filePath)).toBe(true);

    // Verify the data was saved
    const loaded = loadState(tmpDir);
    expect(loaded).toBeDefined();
    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });
    expect(
      restoredStore.getState().data.notes.get(eid('note-unsub'))?.content
    ).toBe('After subscribe');
  });
});
