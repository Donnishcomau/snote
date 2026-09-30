import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('empty-trash', () => {
  let store: ReturnType<typeof makeStore>;
  let runEditor: Mock;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    runEditor = vi.fn();

    // Seed the 5 fixture notes
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

    // Trash note-3 (the "First normal note") so trash has 2 notes
    const note3Id = eid('note-3');
    store.dispatch({ type: 'TRASH_NOTE', noteId: note3Id });
  });

  it('1: WHEN T then E are written THEN the frame contains empty trash (2 notes) - type \'empty\' to confirm and notes is still the same Map as before E (toBe)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('E');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain("empty trash (2 notes) - type 'empty' to confirm");
    expect(store.getState().data.notes).toBe(notesBefore);
  });

  it('2: WHEN T, E, then e, m, p, t, y, \\r are written THEN notes went from size 5 to 3, has neither note-2 nor note-3, still has note-1, the frame line with 0 notes also contains trash, and no type \'empty\' to confirm', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.size).toBe(5);

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('E');
    await new Promise((r) => setTimeout(r, 50));

    // Type "empty" then Enter - but we type "empt" then "y" (wrong: "empty" has 5 chars, we type e,m,p,t,y)
    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('t');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const notesAfter = store.getState().data.notes;
    expect(notesAfter.size).toBe(3);
    expect(notesAfter.has('note-2' as never)).toBe(false);
    expect(notesAfter.has('note-3' as never)).toBe(false);
    expect(notesAfter.has('note-1' as never)).toBe(true);

    const frame = lastFrame();
    expect(frame).toMatch(/0 notes.*trash/);
    expect(frame).not.toContain("type 'empty' to confirm");
  });

  it('3: WHEN T, E, y, \\r are written (the OLD y key, not the word \'empty\') THEN notes is the same Map as before E (toBe), runEditor was not called, the frame contains 2 notes, and not type \'empty\' to confirm', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('E');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes).toBe(notesBefore);
    expect(runEditor).not.toHaveBeenCalled();

    const frame = lastFrame();
    expect(frame).toContain('2 notes');
    expect(frame).not.toContain("type 'empty' to confirm");
  });

  it('4: WHEN T, E, then e, m are written THEN the frame contains type \'empty\' to confirm: em; WHEN \\u001b follows THEN the frame no longer contains type \'empty\' to confirm and notes is the same Map as before E (toBe)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('E');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain("type 'empty' to confirm: em");

    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain("type 'empty' to confirm");
    expect(store.getState().data.notes).toBe(notesBefore);
  });

  it('5: WHEN E is written in the all-notes view THEN the frame has no empty trash, still contains 3 notes, and notes is the same Map as before (toBe)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    // Stay in all-notes view (don't press T)
    stdin.write('E');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).not.toContain('empty trash');
    expect(frame).toContain('3 notes');
    expect(store.getState().data.notes).toBe(notesBefore);
  });

  it('6: WHEN note-2 and note-3 were restored with RESTORE_NOTE before render (empty trash) and T then E are written THEN the frame contains 0 notes and no empty trash, and notes still has size 5', async () => {
    // Restore both trashed notes before render
    store.dispatch({ type: 'RESTORE_NOTE', noteId: 'note-2' as never });
    store.dispatch({ type: 'RESTORE_NOTE', noteId: 'note-3' as never });

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('E');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('0 notes');
    expect(frame).not.toContain('empty trash');
    expect(store.getState().data.notes.size).toBe(5);
  });
});
