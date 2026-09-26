import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const tick = async (ms: number) => {
  await new Promise((r) => setTimeout(r, ms));
};

const settle = async (
  lastFrame: () => string | undefined,
  wanted: (frame: string) => boolean
): Promise<void> => {
  for (let i = 0; i < 40; i++) {
    const frame = lastFrame() ?? '';
    if (wanted(frame)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('New note is selected when the editor closes', () => {
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

  it('1: WHEN j, j (marker on Second normal note) and then n are written and the editor resolves Brand new note\\nbody THEN the frame contains >Brand new note and Preview: Brand new note, 5 notes, and does not contain >Second normal note', async () => {
    const runEditor = vi.fn().mockResolvedValue('Brand new note\nbody');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('j');
    await tick(50);
    stdin.write('j');
    await tick(50);
    expect(lastFrame()).toContain('>Second normal note');

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('>Brand new note'));

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Brand new note');
    expect(frame).toContain('Preview: Brand new note');
    expect(frame).toContain('5 notes');
    expect(frame).not.toContain('>Second normal note');
    expect(runEditor).toHaveBeenCalledTimes(1);
  });

  it('2: WHEN after line 1 j is written THEN the frame contains >Third normal note (the marker moves on from the new row as usual)', async () => {
    const runEditor = vi.fn().mockResolvedValue('Brand new note\nbody');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('j');
    await tick(50);
    stdin.write('j');
    await tick(50);

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('>Brand new note'));

    stdin.write('j');
    await settle(lastFrame, (f) => f.includes('>Third normal note'));

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Third normal note');
  });

  it('3: WHEN j is written and then the TEST dispatches CREATE_NOTE_WITH_ID for remote-1 with content From elsewhere and NO meta THEN the frame contains >Third normal note and " From elsewhere" (the marker did not jump)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick(50);

    stdin.write('j');
    await tick(50);

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('remote-1'),
      note: {
        content: 'From elsewhere\nRemote body',
        systemTags: [],
        tags: [],
        modificationDate: Date.now() / 1000,
      },
    } as never);
    await settle(
      lastFrame,
      (f) => f.includes('>Third normal note') && f.includes(' From elsewhere')
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Third normal note');
    expect(frame).toContain(' From elsewhere');
    expect(frame).not.toContain('>From elsewhere');
  });

  it('4: WHEN n is written and the editor resolves null THEN the frame still contains >Pinned note and data.notes is the same Map as before (toBe)', async () => {
    const runEditor = vi.fn().mockResolvedValue(null);
    const before = store.getState().data.notes;
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('n');
    await settle(lastFrame, () => runEditor.mock.calls.length === 1);
    await tick(50);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Pinned note');
    expect(store.getState().data.notes).toBe(before);
  });

  it('5: WHEN j and then h are written THEN the frame contains History, and after \\u001b it contains >Third normal note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await tick(50);

    stdin.write('j');
    await tick(50);

    stdin.write('h');
    await settle(lastFrame, (f) => f.includes('History'));
    expect(lastFrame()).toContain('History');

    stdin.write('\u001b');
    await settle(lastFrame, (f) => f.includes('>Third normal note'));

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Third normal note');
    expect(frame).not.toContain('History');
  });
});
