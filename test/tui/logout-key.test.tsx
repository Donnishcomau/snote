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

describe('Logout key (T71)', () => {
  let store: ReturnType<typeof makeStore>;
  let onLogout: Mock;
  let onQuit: Mock;
  let runEditor: Mock;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    onLogout = vi.fn();
    onQuit = vi.fn();
    runEditor = vi.fn().mockResolvedValue('edited content');

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

  it('1: WHEN L is written THEN before the frame contains "4 notes" and no "log out"; after the frame contains "log out and delete local data? y/n" and onLogout was called 0 times', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onLogout={onLogout} onQuit={onQuit} runEditor={runEditor} />
    );

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    // Before L: should have "4 notes" and no "log out"
    let frame = lastFrame();
    expect(frame).toContain('4 notes');
    expect(frame).not.toContain('log out');

    // Press L
    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));

    // After L: should have "log out and delete local data? y/n" and onLogout not called
    frame = lastFrame();
    expect(frame).toContain('log out and delete local data? y/n');
    expect(onLogout).toHaveBeenCalledTimes(0);
  });

  it('2: WHEN L then y are written THEN onLogout was called exactly once, onQuit 0 times, the frame does not contain "log out", and data.notes is the same Map as before', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onLogout={onLogout} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const initialNotes = store.getState().data.notes;

    // Press L then y
    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onQuit).toHaveBeenCalledTimes(0);

    const frame = lastFrame();
    expect(frame).not.toContain('log out');
    expect(store.getState().data.notes).toBe(initialNotes);
  });

  it('3: WHEN L then n are written THEN onLogout and runEditor were called 0 times, store.getState().data.notes is the same Map as before, and the frame contains "4 notes"', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onLogout={onLogout} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const initialNotes = store.getState().data.notes;

    // Press L then n
    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('n');
    await new Promise((r) => setTimeout(r, 50));

    expect(onLogout).toHaveBeenCalledTimes(0);
    expect(runEditor).toHaveBeenCalledTimes(0);
    expect(store.getState().data.notes).toBe(initialNotes);

    const frame = lastFrame();
    expect(frame).toContain('4 notes');
  });

  it('4: WHEN L, then q, then e are written THEN onQuit and runEditor were called 0 times and the frame still contains "log out"', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onLogout={onLogout} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press L then q then e
    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('q');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));

    expect(onQuit).toHaveBeenCalledTimes(0);
    expect(runEditor).toHaveBeenCalledTimes(0);

    const frame = lastFrame();
    expect(frame).toContain('log out');
  });

  it('5: WHEN the app is rendered without onLogout and L is written THEN the frame does not contain "log out" and still contains "4 notes"; WHEN j follows THEN the frame contains ">Third normal note"', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press L without onLogout
    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).not.toContain('log out');
    expect(frame).toContain('4 notes');

    // Press j to move down
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toMatch(/>Third normal note/);
  });

  it('6: WHEN keymap is read THEN exactly one entry has the key "L", its action is "logout", and no entry has the key "l"', async () => {
    const lEntries = keymap.filter((e) => e.key === 'L');
    expect(lEntries.length).toBe(1);
    expect(lEntries[0].action).toBe('logout');

    const lLowerEntries = keymap.filter((e) => e.key === 'l');
    expect(lLowerEntries.length).toBe(0);
  });
});
