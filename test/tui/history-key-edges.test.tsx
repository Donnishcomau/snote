import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote, testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('History key (h) edge cases', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    testNotes.forEach((note, idx) => {
      const noteId = eid(`note-${idx + 1}`);
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId,
        note: {
          content: note.content,
          systemTags: note.systemTags,
          tags: note.tags,
          deleted: note.deleted,
          modificationDate: note.modificationDate,
          creationDate: note.creationDate,
        },
      });
    });
  });

  it('1: WHEN h then \\r are sent and nothing was loaded THEN ui.showRevisions is false, the frame contains >Pinned note and not History, and data.notes is the same Map object as before the first key', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const initialNotesMap = store.getState().data.notes;

    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const state = store.getState();
    expect(state.ui.showRevisions).toBe(false);

    const frame = lastFrame();
    expect(frame).toContain('>Pinned note');
    expect(frame).not.toContain('History');

    expect(state.data.notes).toBe(initialNotesMap);
  });

  it('2: WHEN the store has no notes (frame shows 0 notes) and h is sent THEN ui.openedNote is still null, ui.showRevisions is still false, and the frame does not contain History', async () => {
    const emptyStore = makeStore({ stubClient: {} });

    const { stdin, lastFrame } = render(
      <App store={emptyStore} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const initialState = emptyStore.getState();
    expect(initialState.ui.openedNote).toBe(null);
    expect(initialState.ui.showRevisions).toBe(false);
    expect(lastFrame()).toContain('0 notes');

    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    const state = emptyStore.getState();
    expect(state.ui.openedNote).toBe(null);
    expect(state.ui.showRevisions).toBe(false);

    const frame = lastFrame();
    expect(frame).not.toContain('History');
  });

  it('3: WHEN h then h are sent THEN ui.showRevisions is false and the frame contains Notes and >Pinned note, not History', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // First h opens history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Second h closes history (toggle behavior)
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    const state = store.getState();
    expect(state.ui.showRevisions).toBe(false);

    const frame = lastFrame();
    expect(frame).toContain('Notes');
    expect(frame).toContain('>Pinned note');
    expect(frame).not.toContain('History');
  });

  it('4: WHEN after h and the load a second LOAD_REVISIONS brings version 3 = makeNote(note-1, Newest pinned text) THEN the frame contains >v3, v2, v1 and Newest pinned text', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Initial load: versions 1 and 2
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    // Second load brings version 3
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [3, makeNote('note-1', 'Newest pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('>v3');
    expect(frame).toContain(' v2');
    expect(frame).toContain(' v1');
    expect(frame).toContain('Newest pinned text');
  });

  it('5: WHEN h, \\u001b, j, q are sent with onQuit as vi.fn() THEN after j the frame contains >Third normal note, and after q onQuit was called 1 time', async () => {
    const onQuit = vi.fn();

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Escape closes history
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    // Move down twice: note-1 (pinned) -> note-5 -> note-4 (Third normal note is note-5, wait... need to check)
    // After pinned note-1 is selected, j moves to note-5 (Third normal note), j moves to note-4 (Second normal note)
    // Actually the sorted order is: note-1 (pinned), note-5, note-4, note-3
    // So j goes from note-1 (index 0) to note-5 (index 1), and j goes from note-5 (index 1) to note-4 (index 2)
    // Third normal note is note-5
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));

    let frame = lastFrame();
    // After first j: should be note-5 (Third normal note)
    expect(frame).toContain('>Third normal note');

    // Second j: note-4 (Second normal note)
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));

    frame = lastFrame();
    expect(frame).toContain('>Second normal note');

    // q quits
    stdin.write('q');
    await new Promise((r) => setTimeout(r, 50));

    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it('6: WHEN j then h are sent and the load (for note-1) is done THEN ui.openedNote is note-5, and the frame contains History and loading... and does not contain >v2', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Move down: from note-1 to note-5
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    // Open history for note-5 (the currently selected note)
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch the revisions load for note-1 (not the currently selected note)
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    const state = store.getState();
    expect(state.ui.openedNote).toBe('note-5');

    const frame = lastFrame();
    expect(frame).toContain('History');
    expect(frame).toContain('loading...');
    expect(frame).not.toContain('>v2');
  });
});
