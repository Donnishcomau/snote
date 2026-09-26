import { describe, it, expect, beforeEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import * as selectors from '@vendor/state/selectors';
import type { EntityId, TagName } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;

describe('store', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    // Create a fresh store for each test with a stub client
    store = makeStore({ stubClient: {} });
  });

  it('creates a store with initial state', () => {
    const state = store.getState();
    
    expect(state.data.notes.size).toBe(0);
    expect(state.data.tags.size).toBe(0);
    expect(state.ui.collection.type).toBe('all');
    expect(state.ui.openedNote).toBeNull();
    expect(state.settings.theme).toBe('system');
  });

  it('handles CREATE_NOTE_WITH_ID action', () => {
    const noteId = eid('test-note-id-123');
    
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: 'Hello, world!',
        systemTags: [],
        tags: [],
      },
    });

    const state = store.getState();
    const note = state.data.notes.get(noteId);
    
    expect(note).toBeDefined();
    expect(note?.content).toBe('Hello, world!');
    expect(note?.deleted).toBe(false);
  });

  it('handles EDIT_NOTE action', () => {
    const noteId = eid('test-note-id-456');
    
    // First create the note
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: 'Initial content',
        systemTags: [],
        tags: [],
      },
    });

    // Then edit it
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId,
      changes: { content: 'Updated content' },
    });

    const state = store.getState();
    const note = state.data.notes.get(noteId);
    
    expect(note?.content).toBe('Updated content');
  });

  it('handles TRASH_NOTE action', () => {
    const noteId = eid('test-note-id-789');
    
    // Create the note
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: 'Note to trash',
        systemTags: [],
        tags: [],
      },
    });

    // Trash it
    store.dispatch({
      type: 'TRASH_NOTE',
      noteId,
    });

    const state = store.getState();
    const note = state.data.notes.get(noteId);
    
    expect(note?.deleted).toBe(true);
  });

  it('handles PIN_NOTE action', () => {
    const noteId = eid('test-note-id-pin');
    
    // Create the note
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: 'Note to pin',
        systemTags: [],
        tags: [],
      },
    });

    // Pin it
    store.dispatch({
      type: 'PIN_NOTE',
      noteId,
      shouldPin: true,
    });

    const state = store.getState();
    const note = state.data.notes.get(noteId);
    
    expect(note?.systemTags).toContain('pinned');
  });

  it('uses vendored selectors to read state', () => {
    const noteId1 = eid('note-1');
    const noteId2 = eid('note-2');
    
    // Create two notes
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: noteId1,
      note: {
        content: 'First note',
        systemTags: ['pinned'],
        tags: [],
      },
    });
    
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: noteId2,
      note: {
        content: 'Second note',
        systemTags: [],
        tags: [tname('work')],
      },
    });

    const state = store.getState();
    
    // Use vendored selectors
    expect(selectors.openedTag(state)).toBeNull();
    expect(selectors.showTrash(state)).toBe(false);
  });
});
