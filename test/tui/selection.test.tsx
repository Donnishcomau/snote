import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

function seedFixture(store: ReturnType<typeof makeStore>): void {
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
}

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * Return the line index (0-based) where a note title first appears.
 * A title appears as the leading text on its title line: "> Title" or " Title".
 */
function titleLineIndex(frame: string, title: string): number {
  const lines = frame.split('\n');
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].replace(/\x1b\[[0-9;]*m/g, '');
    // Match title as the first non-space content on the line
    const re = new RegExp(`^(>|\\s)\\s*${escaped}`);
    if (re.test(cleaned)) return i;
  }
  return -1;
}

/**
 * Extract note titles from the frame in display order, for the given known titles.
 */
function noteTitles(frame: string, known: string[]): string[] {
  const titles: [string, number][] = [];
  for (const t of known) {
    const idx = titleLineIndex(frame, t);
    if (idx >= 0) titles.push([t, idx]);
  }
  titles.sort((a, b) => a[1] - b[1]);
  return titles.map(([t]) => t);
}

describe('Selection follows note ID when list re-sorts', () => {
  it("1: WHEN j is written (marker on Third normal note) and the test dispatches EDIT_NOTE for note-3 THEN First normal note now comes before Third normal note in the frame and the frame contains '>Third normal note'", async () => {
    const store = makeStore({ stubClient: {} });
    seedFixture(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick();

    // j moves from Pinned note to Third normal note
    stdin.write('j');
    await tick();

    const frame1 = lastFrame();
    expect(frame1).toMatch(/>Third normal note/);

    // Editing note-3 changes its modificationDate to now, moving it after note-5
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-3'),
      changes: { content: 'First normal note\nedited' },
    });
    await tick();

    const frame2 = lastFrame();
    const t = noteTitles(frame2, ['First normal note', 'Third normal note']);
    const idxFirst = t.indexOf('First normal note');
    const idxThird = t.indexOf('Third normal note');
    expect(idxFirst).toBeGreaterThan(-1);
    expect(idxThird).toBeGreaterThan(-1);
    expect(idxFirst).toBeLessThan(idxThird);
    // Marker should still be on Third normal note
    expect(frame2).toMatch(/>Third normal note/);
  });

  it("2: WHEN j is written and the test dispatches { type: 'setSortType', sortType: 'alphabetical' } THEN Third normal note is now the last title in the frame and the frame contains '>Third normal note'", async () => {
    const store = makeStore({ stubClient: {} });
    seedFixture(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick();

    stdin.write('j');
    await tick();

    const frame1 = lastFrame();
    expect(frame1).toMatch(/>Third normal note/);

    store.dispatch({
      type: 'setSortType',
      sortType: 'alphabetical',
    } as never);
    await tick();

    const frame2 = lastFrame();
    const t = noteTitles(frame2, ['First normal note', 'Second normal note', 'Third normal note']);
    const idxFirst = t.indexOf('First normal note');
    const idxSecond = t.indexOf('Second normal note');
    const idxThird = t.indexOf('Third normal note');
    expect(idxFirst).toBeLessThan(idxSecond);
    expect(idxSecond).toBeLessThan(idxThird);
    expect(idxThird).toBeGreaterThan(-1);
    expect(frame2).toMatch(/>Third normal note/);
  });

  it("3: WHEN j is written and the test dispatches PIN_NOTE with shouldPin: true for note-4 THEN Second normal note comes before Third normal note in the frame and the frame contains '>Third normal note'", async () => {
    const store = makeStore({ stubClient: {} });
    seedFixture(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick();

    stdin.write('j');
    await tick();

    const frame1 = lastFrame();
    expect(frame1).toMatch(/>Third normal note/);

    store.dispatch({
      type: 'PIN_NOTE',
      noteId: eid('note-4'),
      shouldPin: true,
    });
    await tick();

    const frame2 = lastFrame();
    const t = noteTitles(frame2, ['Second normal note', 'Third normal note']);
    const idxSecond = t.indexOf('Second normal note');
    const idxThird = t.indexOf('Third normal note');
    expect(idxSecond).toBeLessThan(idxThird);
    expect(frame2).toMatch(/>Third normal note/);
  });

  it("4: WHEN j is written and the test dispatches DELETE_NOTE_FOREVER for note-5 (the marked note, a middle row) THEN the frame contains '>Second normal note' (same row number, next note) and '3 notes'", async () => {
    const store = makeStore({ stubClient: {} });
    seedFixture(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick();

    stdin.write('j');
    await tick();

    const frame1 = lastFrame();
    expect(frame1).toMatch(/>Third normal note/);

    // note-5 (Third normal note) is currently selected
    store.dispatch({
      type: 'DELETE_NOTE_FOREVER',
      noteId: eid('note-5'),
    });
    await tick();

    const frame2 = lastFrame();
    // After deletion, remaining notes: Pinned note, Second normal note, First normal note
    // selectedIdRef.current = 'note-5'. findIndex returns -1. Clamp to length-1.
    // selectedIndex was 1, clamp to min(1, 2) = 1. Row 1 = Second normal note.
    expect(frame2).toMatch(/>Second normal note/);
    expect(frame2).toContain('3 notes');
  });

  it("5: WHEN j, j, j are written and the test dispatches DELETE_NOTE_FOREVER for note-3 (the marked note, the last row) THEN the frame contains '>Second normal note' (the marker moves up to the new last row)", async () => {
    const store = makeStore({ stubClient: {} });
    seedFixture(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick();

    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();
    stdin.write('j');
    await tick();

    const frame1 = lastFrame();
    // After 3 j's: selectedIndex = 3 (First normal note / note-3)
    expect(frame1).toMatch(/>First normal note/);

    // Delete note-3 (the selected note)
    store.dispatch({
      type: 'DELETE_NOTE_FOREVER',
      noteId: eid('note-3'),
    });
    await tick();

    const frame2 = lastFrame();
    // Remaining: Pinned, Third, Second. selectedIndex was 3, clamp to min(3, 2) = 2.
    // Row 2 = Second normal note.
    expect(frame2).toMatch(/>Second normal note/);
  });

  it("6: WHEN EDIT_NOTE for note-5 is dispatched, j is written, EDIT_NOTE for note-3 is dispatched and d is written THEN after the first edit the frame contains '>Pinned note'; at the end note-5 has deleted true, note-3 false", async () => {
    const store = makeStore({ stubClient: {} });
    seedFixture(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick();

    // Edit note-5: its modificationDate goes to now, so it becomes the newest
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-5'),
      changes: { content: 'Third normal note\nedited' },
    });
    await tick();

    let frame1 = lastFrame();
    // After first edit, the frame should still show selection at Pinned note (selectedIndex=0)
    expect(frame1).toMatch(/>Pinned note/);

    // j: move to row 1 (Third normal note / note-5)
    stdin.write('j');
    await tick();

    // Edit note-3: its modificationDate goes to now, so it jumps above note-5
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('note-3'),
      changes: { content: 'First normal note\nedited again' },
    });
    await tick();

    let frame2 = lastFrame();
    // note-3 moves to position 1 (after pinned). note-5 is now at position 2.
    // selectedIdRef.current = 'note-5'. findIndex finds it at position 2.
    // selectedIndex = 2. Row 2 = Third normal note.
    expect(frame2).toMatch(/>Third normal note/);

    // d: trash the currently selected note (note-5, Third normal note)
    stdin.write('d');
    await tick();

    const frame3 = lastFrame();
    const state = store.getState();
    const note5 = state.data.notes.get(eid('note-5'));
    const note3 = state.data.notes.get(eid('note-3'));
    expect(note5?.deleted).toBe(true);
    expect(note3?.deleted).toBe(false);
  });

});
