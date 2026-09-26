import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { saveState, loadState } from '../../src/core/persistence';
import type { EntityId, TagName } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('persistence-nested', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-persist-nested-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1: WHEN loadState(dir) is called THEN data.noteTags.get("work") is an instance of Set and has n1', () => {
    const store = makeStore({ stubClient: {} });

    // Seed: CREATE_NOTE_WITH_ID for n1 and n2
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n1'),
      note: {
        content: 'Note 1',
        systemTags: [],
        tags: [],
      },
    });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n2'),
      note: {
        content: 'Note 2',
        systemTags: [],
        tags: [],
      },
    });

    // ADD_NOTE_TAG with tagName: 'work' on n1
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('n1'),
      tagName: 'work' as TagName,
    });

    saveState(store.getState(), tmpDir);

    const loaded = loadState(tmpDir);
    expect(loaded).toBeDefined();

    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });

    const noteTags = restoredStore.getState().data.noteTags;
    const workSet = noteTags.get('work' as never);
    expect(workSet).toBeInstanceOf(Set);
    expect(workSet!.has(eid('n1'))).toBe(true);
  });

  it('2: WHEN makeStore({ stubClient: {}, preloadedState: loadState(dir) }) is created and ADD_NOTE_TAG with tagName: "work" is dispatched for n2 THEN nothing throws and data.noteTags.get("work") has both n1 and n2', () => {
    const store = makeStore({ stubClient: {} });

    // Seed: CREATE_NOTE_WITH_ID for n1 and n2
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n1'),
      note: {
        content: 'Note 1',
        systemTags: [],
        tags: [],
      },
    });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n2'),
      note: {
        content: 'Note 2',
        systemTags: [],
        tags: [],
      },
    });

    // ADD_NOTE_TAG with tagName: 'work' on n1
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('n1'),
      tagName: 'work' as TagName,
    });

    saveState(store.getState(), tmpDir);

    // Reload into a new store
    const loaded = loadState(tmpDir);
    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });

    // This should NOT throw - the Set was properly revived
    expect(() =>
      restoredStore.dispatch({
        type: 'ADD_NOTE_TAG',
        noteId: eid('n2'),
        tagName: 'work' as TagName,
      })
    ).not.toThrow();

    const noteTags = restoredStore.getState().data.noteTags;
    const workSet = noteTags.get('work' as never);
    expect(workSet).toBeInstanceOf(Set);
    expect(workSet!.has(eid('n1'))).toBe(true);
    expect(workSet!.has(eid('n2'))).toBe(true);
  });

  it('3: WHEN loadState(dir) is called THEN data.notes is a Map of size 2 and data.tags.get("work").name is work', () => {
    const store = makeStore({ stubClient: {} });

    // Seed: CREATE_NOTE_WITH_ID for n1 and n2
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n1'),
      note: {
        content: 'Note 1',
        systemTags: [],
        tags: [],
      },
    });

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n2'),
      note: {
        content: 'Note 2',
        systemTags: [],
        tags: [],
      },
    });

    // ADD_NOTE_TAG with tagName: 'work' on n1
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('n1'),
      tagName: 'work' as TagName,
    });

    saveState(store.getState(), tmpDir);

    const loaded = loadState(tmpDir);
    expect(loaded).toBeDefined();

    const restoredStore = makeStore({
      stubClient: {},
      preloadedState: loaded,
    });

    const notes = restoredStore.getState().data.notes;
    expect(notes).toBeInstanceOf(Map);
    expect(notes.size).toBe(2);

    const tags = restoredStore.getState().data.tags;
    expect(tags).toBeInstanceOf(Map);
    const workTag = tags.get('work' as never);
    expect(workTag).toBeDefined();
    expect(workTag!.name).toBe('work');
  });
});
