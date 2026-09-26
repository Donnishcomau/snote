import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('cancelled edit leaves store unchanged', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('1: WHEN runEditor resolves null and e is pressed on a selected note THEN data.notes is the same Map object and content is unchanged', async () => {
    // Seed a note
    const noteId = eid('note-cancel-1');
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: 'original content',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: 1000,
        creationDate: 1000,
      },
    });

    const mockEditor = vi.fn().mockResolvedValue(null);

    const { stdin } = render(
      <App store={store} width={80} height={24} runEditor={mockEditor} />
    );

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;
    const noteBefore = notesBefore.get(noteId)!;

    // Press 'e' to edit
    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));

    // Editor should have been called
    expect(mockEditor).toHaveBeenCalledTimes(1);
    expect(mockEditor).toHaveBeenCalledWith('original content');

    // data.notes should be the exact same Map object (reference equality)
    const notesAfter = store.getState().data.notes;
    expect(notesAfter).toBe(notesBefore);

    // Note content should be unchanged
    const noteAfter = notesAfter.get(noteId)!;
    expect(noteAfter.content).toBe('original content');
    expect(noteAfter).toBe(noteBefore);
  });

  it('2: WHEN runEditor resolves null and n is pressed THEN data.notes.size is the same as before', async () => {
    const mockEditor = vi.fn().mockResolvedValue(null);

    const { stdin } = render(
      <App store={store} width={80} height={24} runEditor={mockEditor} />
    );

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    const initialCount = store.getState().data.notes.size;

    // Press 'n' to create a new note
    stdin.write('n');
    await new Promise((r) => setTimeout(r, 50));

    // Editor should have been called with empty string
    expect(mockEditor).toHaveBeenCalledTimes(1);
    expect(mockEditor).toHaveBeenCalledWith('');

    // notes.size should be unchanged
    const finalCount = store.getState().data.notes.size;
    expect(finalCount).toBe(initialCount);
  });

  it('3: WHEN runEditor resolves brand new and n is pressed THEN data.notes.size grew by one and one note content is brand new', async () => {
    const mockEditor = vi.fn().mockResolvedValue('brand new');

    const { stdin } = render(
      <App store={store} width={80} height={24} runEditor={mockEditor} />
    );

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    const initialCount = store.getState().data.notes.size;

    // Press 'n' to create a new note
    stdin.write('n');
    await new Promise((r) => setTimeout(r, 50));

    // Editor should have been called with empty string
    expect(mockEditor).toHaveBeenCalledTimes(1);
    expect(mockEditor).toHaveBeenCalledWith('');

    // notes.size should have grown by one
    const finalCount = store.getState().data.notes.size;
    expect(finalCount).toBe(initialCount + 1);

    // One note should have the content 'brand new'
    let foundNewNote = false;
    for (const note of store.getState().data.notes.values()) {
      if (note.content === 'brand new') {
        foundNewNote = true;
        break;
      }
    }
    expect(foundNewNote).toBe(true);
  });
});
