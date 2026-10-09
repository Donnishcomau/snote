/**
 * Search key tests (T34).
 * Verifies that / opens a search input, typing filters the list,
 * Enter keeps the filter, Escape clears it.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes, sortedNotes } from './fixtures';
import { keymap } from '../../src/core/keymap';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('Search', () => {
  let store: ReturnType<typeof makeStore>;
  let onQuit: Mock;
  let runEditor: Mock;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed notes in the store
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

    onQuit = vi.fn();
    runEditor = vi.fn();
  });

  it('1: WHEN / then first are written THEN before them the frame has 4 notes; after them ui.searchQuery is first and the frame contains search: first, First normal note and 1 notes, and does not contain Second normal note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    // Wait for initial render
    await new Promise(r => setTimeout(r, 50));

    const frameBefore = lastFrame();
    expect(frameBefore).toContain('4 notes');

    // Type / then first
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('first');
    await new Promise(r => setTimeout(r, 50));

    const frameAfter = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('first');
    expect(frameAfter).toContain('search: first');
    expect(frameAfter).toContain('First normal note');
    expect(frameAfter).toContain('1 note');
    expect(frameAfter).not.toContain('Second normal note');
  });

  it('2: WHEN /, normal, \r, then j are written THEN ui.searchQuery is still normal and the frame contains search: normal, 3 notes and >Second normal note, and does not contain Pinned note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type normal
    stdin.write('normal');
    await new Promise(r => setTimeout(r, 50));
    // Press Enter to keep the filter
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    // Move down to second note
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('normal');
    expect(frame).toContain('search: normal');
    expect(frame).toContain('3 notes');
    expect(frame).toMatch(/>Second normal note/);
    expect(frame).not.toContain('Pinned note');
  });

  it('3: WHEN /, first, then \u001b are written THEN ui.searchQuery is \'\' and the frame contains Second normal note and 4 notes and does not contain search:', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type first
    stdin.write('first');
    await new Promise(r => setTimeout(r, 50));
    // Press Escape to clear
    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('');
    expect(frame).toContain('Second normal note');
    expect(frame).toContain('4 notes');
    expect(frame).not.toContain('search:');
  });

  it('4: WHEN /, q, then ? are written THEN ui.searchQuery is q?, onQuit was not called and the frame does not contain Help - Keyboard Shortcuts', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type q
    stdin.write('q');
    await new Promise(r => setTimeout(r, 50));
    // Type ?
    stdin.write('?');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('q?');
    expect(onQuit).not.toHaveBeenCalled();
    expect(frame).not.toContain('Help - Keyboard Shortcuts');
  });

  it('5: WHEN /, zzz, \r, then e are written THEN the frame contains 0 notes and search: zzz, runEditor was not called and data.notes is the same Map (toBe) as before', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    const initialNotesMap = store.getState().data.notes;

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type zzz
    stdin.write('zzz');
    await new Promise(r => setTimeout(r, 50));
    // Press Enter to keep the filter
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    // Press e (should not edit since no note is selected)
    stdin.write('e');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('0 notes');
    expect(frame).toContain('search: zzz');
    expect(runEditor).not.toHaveBeenCalled();
    expect(store.getState().data.notes).toBe(initialNotesMap);
  });

  it('6: WHEN keymap from src/core/keymap.ts is read THEN it has an entry with key / and action search', () => {
    const searchEntry = keymap.find((e) => e.key === '/');
    expect(searchEntry).toBeDefined();
    expect(searchEntry?.action).toBe('search');
  });
});
