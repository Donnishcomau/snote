/**
 * Search input edges (T112).
 * Verifies: Backspace removes last character, Escape clears a kept query
 * after the input was closed, and note keys act on the filtered list.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('Search edges', () => {
  let store: ReturnType<typeof makeStore>;
  let onQuit: ReturnType<typeof vi.fn>;
  let runEditor: ReturnType<typeof vi.fn>;

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
    runEditor = vi.fn().mockResolvedValue(null);
  });

  it('1: WHEN /, firstx, then BACKSPACE are written THEN before the Backspace the frame has 0 notes; after it ui.searchQuery is first and the frame contains search: first and 1 notes', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frameBefore = lastFrame();
    expect(frameBefore).toContain('4 notes');

    // Type / then firstx
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('firstx');
    await new Promise(r => setTimeout(r, 50));

    // Before Backspace: 0 notes (no note contains "firstx")
    const frameBeforeBackspace = lastFrame();
    expect(frameBeforeBackspace).toContain('0 notes');

    // Press Backspace
    stdin.write('\x7f');
    await new Promise(r => setTimeout(r, 50));

    const frameAfter = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('first');
    expect(frameAfter).toContain('search: first');
    expect(frameAfter).toContain('1 notes');
  });

  it('2: WHEN / then BACKSPACE are written THEN ui.searchQuery is empty, the frame contains search: and 4 notes, and a following first gives 1 notes (the input is still open)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Press Backspace on empty query
    stdin.write('\x7f');
    await new Promise(r => setTimeout(r, 50));

    const frameAfter = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('');
    expect(frameAfter).toContain('search:');
    expect(frameAfter).toContain('4 notes');

    // Following first gives 1 note (input still open)
    stdin.write('first');
    await new Promise(r => setTimeout(r, 50));

    const frameAfterFirst = lastFrame();
    expect(frameAfterFirst).toContain('1 notes');
  });

  it('3: WHEN /, pinned, ENTER, then ESCAPE are written THEN ui.searchQuery is empty and the frame contains 4 notes and >Pinned note and does not contain search:', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type pinned (matches only the pinned note)
    stdin.write('pinned');
    await new Promise(r => setTimeout(r, 50));
    // Press Enter to keep the filter
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    // Press Escape to clear the kept query
    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('');
    expect(frame).toContain('4 notes');
    expect(frame).toMatch(/>Pinned note/);
    expect(frame).not.toContain('search:');
  });

  it('4: WHEN no query is active and ESCAPE is written THEN lastFrame() is the same string as before the key and ui.searchQuery is empty', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frameBefore = lastFrame();
    expect(frameBefore).toContain('4 notes');

    // Press Escape with no active query
    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    const frameAfter = lastFrame();
    expect(frameAfter).toBe(frameBefore);
    expect(store.getState().ui.searchQuery).toBe('');
  });

  it('5: WHEN /, second, ENTER, then e are written THEN runEditor was called once with the content that starts with Second normal note, and ui.searchQuery is still second', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type second
    stdin.write('second');
    await new Promise(r => setTimeout(r, 50));
    // Press Enter to keep the filter
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));

    const frameAfterEnter = lastFrame();
    expect(frameAfterEnter).toContain('search: second');

    // Move down to the matching note
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // Press e to edit
    stdin.write('e');
    await new Promise(r => setTimeout(r, 50));

    expect(runEditor).toHaveBeenCalledTimes(1);
    expect(runEditor.mock.calls[0][0]).toMatch(/^Second normal note/);
    expect(store.getState().ui.searchQuery).toBe('second');
  });

  it('6: WHEN /, ab, then CTRL+A and TAB are written THEN ui.searchQuery is ab', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Type /
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    // Type ab
    stdin.write('ab');
    await new Promise(r => setTimeout(r, 50));
    // Press Ctrl+A
    stdin.write('\x01');
    await new Promise(r => setTimeout(r, 50));
    // Press Tab
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(store.getState().ui.searchQuery).toBe('ab');
    expect(frame).toContain('search: ab');
  });
});
