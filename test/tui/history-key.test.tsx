import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote, testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('History key (h)', () => {
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

  it('1: WHEN h is sent THEN ui.openedNote goes from null to note-1, ui.showRevisions goes from false to true, and the frame contains History and loading...', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const initialState = store.getState();
    expect(initialState.ui.openedNote).toBe(null);
    expect(initialState.ui.showRevisions).toBe(false);

    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    const state = store.getState();
    expect(state.ui.openedNote).toBe('note-1');
    expect(state.ui.showRevisions).toBe(true);

    const frame = lastFrame();
    expect(frame).toContain('History');
    expect(frame).toContain('loading...');
  });

  it('2: WHEN h is sent and the load is done THEN the frame contains >v2, v1 and Newer pinned text, and does not contain loading... or Third normal note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch the revisions load
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('>v2');
    expect(frame).toContain(' v1');
    expect(frame).toContain('Newer pinned text');
    expect(frame).not.toContain('loading...');
    expect(frame).not.toContain('Third normal note');
  });

  it('3: WHEN after the load j, j are sent THEN the frame contains >v1, v2 and Old pinned text; WHEN then k, k are sent THEN it contains >v2 and Newer pinned text', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch the revisions load
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    // Press j twice (one more than there are rows - we have 2 rows, index goes 0 -> 1 -> 1)
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));

    let frame = lastFrame();
    expect(frame).toContain('>v1');
    expect(frame).toContain(' v2');
    expect(frame).toContain('Old pinned text');

    // Press k twice
    stdin.write('k');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('k');
    await new Promise((r) => setTimeout(r, 0));

    frame = lastFrame();
    expect(frame).toContain('>v2');
    expect(frame).toContain('Newer pinned text');
  });

  it('4: WHEN after the load j then Enter are sent THEN note-1 has the content Old pinned text and still the system tag pinned, data.notes.size is 5, ui.showRevisions is false, and the frame contains >Old pinned text, not History', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch the revisions load
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    // Move to v1
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));

    // Press Enter to restore
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const state = store.getState();
    const note1 = state.data.notes.get(eid('note-1'));
    expect(note1?.content).toBe('Old pinned text');
    expect(note1?.systemTags).toContain('pinned');
    expect(state.data.notes.size).toBe(5);
    expect(state.ui.showRevisions).toBe(false);

    const frame = lastFrame();
    expect(frame).toContain('>Old pinned text');
    expect(frame).not.toContain('History');
  });

  it('5: WHEN after the load j then Escape are sent THEN ui.showRevisions is false, the frame contains >Pinned note and not History, and data.notes is the same Map object as before the first key', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const initialNotesMap = store.getState().data.notes;

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch the revisions load
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    // Move to v1
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));

    // Press Escape
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    const state = store.getState();
    expect(state.ui.showRevisions).toBe(false);

    const frame = lastFrame();
    expect(frame).toContain('>Pinned note');
    expect(frame).not.toContain('History');

    expect(state.data.notes).toBe(initialNotesMap);
  });

  it('6: WHEN h then q then e are sent with onQuit and runEditor as vi.fn() THEN neither was called and the frame still contains History', async () => {
    const onQuit = vi.fn();
    const runEditor = vi.fn().mockResolvedValue('edited');

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open history
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch the revisions load
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: eid('note-1'),
      revisions: [
        [1, makeNote('note-1', 'Old pinned text')],
        [2, makeNote('note-1', 'Newer pinned text')],
      ],
    });
    await new Promise((r) => setTimeout(r, 50));

    // Try to quit and edit - should not work while history is open
    stdin.write('q');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('e');
    await new Promise((r) => setTimeout(r, 0));

    expect(onQuit).not.toHaveBeenCalled();
    expect(runEditor).not.toHaveBeenCalled();

    const frame = lastFrame();
    expect(frame).toContain('History');
  });
});
