import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { createNote } from '../../src/tui/app-actions';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const wait = () => new Promise((r) => setTimeout(r, 50));

describe('editor failure notice', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    // 5 testNotes seeded
    testNotes.forEach((note, idx) => {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: eid(`note-${idx + 1}`),
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

  it("1: WHEN n is written with failing THEN the frame contains editor failed: ENOENT, data.notes is the same Map as before (toBe), and the frame still contains 4 notes", async () => {
    const failing = vi.fn().mockRejectedValue(new Error('editor failed: ENOENT'));
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={failing} />
    );

    await wait();
    const before = store.getState().data.notes;
    expect(lastFrame()).toContain('4 notes');

    stdin.write('n');
    await wait();

    const frame = lastFrame();
    expect(frame).toContain('editor failed: ENOENT');
    expect(store.getState().data.notes).toBe(before);
    expect(lastFrame()).toContain('4 notes');
  });

  it('2: WHEN e is written with failing THEN the frame contains editor failed: ENOENT and note-1 still has the content that starts with Pinned note', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('editor failed: ENOENT'));
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={failing} />
    );

    await wait();

    stdin.write('e');
    await wait();

    expect(lastFrame()).toContain('editor failed: ENOENT');
    expect(store.getState().data.notes.get(eid('note-1'))?.content).toMatch(/^Pinned note/);
  });

  it('3: WHEN after line 1 j is written THEN the frame does not contain editor failed and contains >Third normal note (the key still acted)', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('editor failed: ENOENT'));
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={failing} />
    );

    await wait();

    // line 1: n with failing
    stdin.write('n');
    await wait();
    expect(lastFrame()).toContain('editor failed: ENOENT');

    // next key press removes the notice and still acts
    stdin.write('j');
    await wait();

    const frame = lastFrame();
    expect(frame).not.toContain('editor failed');
    expect(frame).toContain('>Third normal note');
  });

  it('4: WHEN createNote is called directly with failing and setRawMode: vi.fn() THEN setRawMode was called with false and then with true, and onEditorError was called 1 time with editor failed: ENOENT', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('editor failed: ENOENT'));
    const ctx = {
      store,
      setRawMode: vi.fn(),
      runEditor: failing,
      setSelectedIndex: vi.fn(),
      onEditorError: vi.fn(),
    };

    createNote(ctx);
    await wait();

    expect(ctx.setRawMode.mock.calls.map((c) => c[0])).toEqual([false, true]);
    expect(ctx.onEditorError).toHaveBeenCalledTimes(1);
    expect(ctx.onEditorError).toHaveBeenCalledWith('editor failed: ENOENT');
  });

  it("5: WHEN n is written with a runEditor that resolves 'fresh note' THEN the frame does not contain editor failed and data.notes.size goes from 5 to 6", async () => {
    const okEditor = vi.fn().mockResolvedValue('fresh note');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={okEditor} />
    );

    await wait();
    expect(store.getState().data.notes.size).toBe(5);

    stdin.write('n');
    await wait();

    expect(lastFrame()).not.toContain('editor failed');
    expect(store.getState().data.notes.size).toBe(6);
  });
});
