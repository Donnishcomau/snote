import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes, sortedNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('Trash', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed notes in the store with all properties including dates
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

  it('1: WHEN d is sent right after start THEN note-1 went from deleted false to true, note-5 stays false, the frame went from 4 notes to 3 notes, has no Pinned note and no trash, and contains >Third normal note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const note1Before = store.getState().data.notes.get('note-1' as never);
    const note5Before = store.getState().data.notes.get('note-5' as never);
    expect(note1Before?.deleted).toBe(false);
    expect(note5Before?.deleted).toBe(false);

    let frame = lastFrame();
    expect(frame).toContain('4 notes');

    stdin.write('d');
    await new Promise((r) => setTimeout(r, 50));

    const note1After = store.getState().data.notes.get('note-1' as never);
    const note5After = store.getState().data.notes.get('note-5' as never);
    expect(note1After?.deleted).toBe(true);
    expect(note5After?.deleted).toBe(false);

    frame = lastFrame();
    expect(frame).toContain('3 notes');
    expect(frame).not.toContain('Pinned note');
    expect(frame).not.toContain('trash');
    expect(frame).toMatch(/>Third normal note/);
  });

  it('2: WHEN T and later T again are sent THEN after the first the frame contains Deleted note, not Third normal note, and the line with 1 notes also contains trash; after the second it contains 4 notes and no trash', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain('Deleted note');
    expect(frame).not.toContain('Third normal note');
    expect(frame).toMatch(/1 notes/);
    expect(frame).toContain('trash');

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('4 notes');
    expect(frame).not.toContain('trash');
  });

  it('3: WHEN T, u, u are sent THEN after the first u note-2 has deleted false and the frame contains 0 notes and no Deleted note; the second u (empty list) leaves notes the same Map (toBe)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('u');
    await new Promise((r) => setTimeout(r, 50));

    const note2After = store.getState().data.notes.get('note-2' as never);
    expect(note2After?.deleted).toBe(false);

    let frame = lastFrame();
    expect(frame).toContain('0 notes');
    expect(frame).not.toContain('Deleted note');

    const notesAfterFirstU = store.getState().data.notes;

    stdin.write('u');
    await new Promise((r) => setTimeout(r, 50));

    const notesAfterSecondU = store.getState().data.notes;
    expect(notesAfterSecondU).toBe(notesAfterFirstU);
  });

  it('4: WHEN T then D are sent THEN notes went from size 5 to 4, no longer has note-2, still has note-1, and the frame contains 0 notes', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.size).toBe(5);

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('D');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.size).toBe(4);
    expect(store.getState().data.notes.has('note-2' as never)).toBe(false);
    expect(store.getState().data.notes.has('note-1' as never)).toBe(true);

    const frame = lastFrame();
    expect(frame).toContain('0 notes');
  });

  it('5: WHEN D, u are sent in the all-notes view and then T, d THEN notes is the same Map as at start (toBe) and note-2 still has deleted true', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;

    stdin.write('D');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('u');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('d');
    await new Promise((r) => setTimeout(r, 50));

    const notesAfter = store.getState().data.notes;
    expect(notesAfter).toBe(notesBefore);

    const note2After = store.getState().data.notes.get('note-2' as never);
    expect(note2After?.deleted).toBe(true);
  });

  it('6: WHEN j, j, j, d are sent THEN note-3 has deleted true, note-4 has deleted false, and the frame contains >Second normal note (the marker moves up to the new last row)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    stdin.write('d');
    await new Promise((r) => setTimeout(r, 50));

    const note3After = store.getState().data.notes.get('note-3' as never);
    const note4After = store.getState().data.notes.get('note-4' as never);
    expect(note3After?.deleted).toBe(true);
    expect(note4After?.deleted).toBe(false);

    const frame = lastFrame();
    expect(frame).toMatch(/>Second normal note/);
  });
});
