import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('edit_note / new_note', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('1: pressing e on a selected note dispatches EDIT_NOTE with edited content', async () => {
    // Seed a note
    const noteId = eid('note-edit-1');
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

    const mockEditor = vi.fn().mockResolvedValue('edited content');

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={mockEditor} />
    );

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('original content');

    // Press 'e' to edit
    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));

    // Editor should have been called with original content
    expect(mockEditor).toHaveBeenCalledTimes(1);
    expect(mockEditor).toHaveBeenCalledWith('original content');

    // Editor returns edited content
    // The store should have dispatched EDIT_NOTE
    const state = store.getState();
    const editedNote = state.data.notes.get(noteId);
    expect(editedNote).toEqual({
      ...editedNote,
      content: 'edited content',
    });
  });

  it('2: pressing n creates a new note and opens the editor', async () => {
    const mockEditor = vi.fn().mockResolvedValue('new note content');

    const { stdin, lastFrame } = render(
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

    // Editor returns content
    const state = store.getState();
    const newCount = state.data.notes.size;
    expect(newCount).toBe(initialCount + 1);

    // Find the new note (the one with "new note content")
    let foundNewNote = false;
    for (const note of state.data.notes.values()) {
      if (note.content === 'new note content') {
        foundNewNote = true;
        break;
      }
    }
    expect(foundNewNote).toBe(true);
  });

  it('3: pressing e with no selected note does nothing', async () => {
    const mockEditor = vi.fn().mockResolvedValue('edited');

    const { stdin } = render(
      <App store={store} width={80} height={24} runEditor={mockEditor} />
    );

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    // Press 'e' with no notes selected (empty store)
    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));

    // Editor should not have been called
    expect(mockEditor).not.toHaveBeenCalled();

    // Store should be unchanged
    expect(store.getState().data.notes.size).toBe(0);
  });
});
