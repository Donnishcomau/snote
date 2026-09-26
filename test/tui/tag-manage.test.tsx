import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;

function seedTags(store: ReturnType<typeof makeStore>) {
  const noteA: EntityId = eid('a');
  const noteB: EntityId = eid('b');
  const noteC: EntityId = eid('c');

  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: noteA,
    note: { content: 'Note a', systemTags: [], tags: [tname('work')], deleted: false, modificationDate: 1000, creationDate: 1000 },
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: noteB,
    note: { content: 'Note b', systemTags: [], tags: [tname('work')], deleted: false, modificationDate: 2000, creationDate: 2000 },
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: noteC,
    note: { content: 'Note c', systemTags: [], tags: [tname('home')], deleted: false, modificationDate: 3000, creationDate: 3000 },
  });
}

describe('Tag rename and delete (T41)', () => {
  it('1: WHEN t, j, j, R, backspace 4 times, job, \\r are sent THEN notes a and b have tags [job], note c still has [home], data.tags has keys home and job, not work, and the frame contains >job', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Open tags pane and select work
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // Press R to rename
    stdin.write('R');
    await new Promise(r => setTimeout(r, 50));

    // Clear "work" with 4 backspaces
    for (let i = 0; i < 4; i++) {
      stdin.write('\x7f');
      await new Promise(r => setTimeout(r, 0));
    }

    // Type "job"
    stdin.write('job');
    await new Promise(r => setTimeout(r, 50));

    // Submit with Enter
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('>job');

    // Check notes
    const state = store.getState();
    const noteAState = state.data.notes.get(eid('a'));
    const noteBState = state.data.notes.get(eid('b'));
    const noteCState = state.data.notes.get(eid('c'));
    expect(noteAState?.tags).toEqual(['job']);
    expect(noteBState?.tags).toEqual(['job']);
    expect(noteCState?.tags).toEqual(['home']);

    // Check data.tags keys
    const tagKeys = Array.from(state.data.tags.keys());
    expect(tagKeys).toContain('home');
    expect(tagKeys).toContain('job');
    expect(tagKeys).not.toContain('work');

    unmount();
  });

  it('2: WHEN t, j, j, R, \\u001b are sent THEN after R the frame contains rename tag: work; after Escape it does not contain rename tag:, still contains All notes, and data.tags is the same Map as before R', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const tagsBefore = state => state.data.tags;
    const beforeMap = tagsBefore(store.getState());

    // Open tags pane and select work
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // Press R to rename
    stdin.write('R');
    await new Promise(r => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain('rename tag: work');

    // Press Escape to cancel
    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain('rename tag:');
    expect(frame).toContain('All notes');

    // data.tags should be the same Map
    expect(store.getState().data.tags).toBe(beforeMap);

    unmount();
  });

  it('3: WHEN t, j, j, x, y are sent THEN notes a and b have tags [], note c still has [home], data.tags.size went from 2 to 1, and the frame no longer contains work', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const initialTagSize = store.getState().data.tags.size;
    expect(initialTagSize).toBe(2);

    // Open tags pane and select work
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // Press x to delete
    stdin.write('x');
    await new Promise(r => setTimeout(r, 50));

    // Press y to confirm
    stdin.write('y');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).not.toContain('work');

    // Check notes
    const state = store.getState();
    const noteAState = state.data.notes.get(eid('a'));
    const noteBState = state.data.notes.get(eid('b'));
    const noteCState = state.data.notes.get(eid('c'));
    expect(noteAState?.tags).toEqual([]);
    expect(noteBState?.tags).toEqual([]);
    expect(noteCState?.tags).toEqual(['home']);

    // Check data.tags.size
    expect(state.data.tags.size).toBe(1);

    unmount();
  });

  it('4: WHEN t, j, j, x, n are sent THEN after x the frame contains delete tag work? y/n; after n it has no delete tag, data.notes and data.tags are the same Maps as before x, runEditor was not called', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);
    const runEditor = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    const notesBefore = store.getState().data.notes;
    const tagsBefore = store.getState().data.tags;

    // Open tags pane and select work
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // Press x to delete
    stdin.write('x');
    await new Promise(r => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).toContain('delete tag work? y/n');

    // Press n to cancel
    stdin.write('n');
    await new Promise(r => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain('delete tag');
    expect(store.getState().data.notes).toBe(notesBefore);
    expect(store.getState().data.tags).toBe(tagsBefore);
    expect(runEditor).not.toHaveBeenCalled();

    unmount();
  });

  it('5: WHEN R, x are sent with the note list focused, then t, R, x (row All notes), then j, j, j, R, x (row Untagged) THEN no frame after any of these keys contains rename tag: or delete tag', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    // R and x with note list focused (tags pane not open)
    stdin.write('R');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('x');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).not.toContain('rename tag:');
    expect(lastFrame()).not.toContain('delete tag');

    // t opens tags pane, R, x on All notes (row 0)
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('R');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('x');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).not.toContain('rename tag:');
    expect(lastFrame()).not.toContain('delete tag');

    // j, j, j goes to Untagged row, R, x should do nothing
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('R');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('x');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).not.toContain('rename tag:');
    expect(lastFrame()).not.toContain('delete tag');

    unmount();
  });

  it('6: WHEN keymap from src/core/keymap.ts is read THEN the entry with key R has the action rename_tag and the entry with key x has the action delete_tag', async () => {
    const { keymap } = await import('../../src/core/keymap');
    const rEntry = keymap.find(e => e.key === 'R');
    const xEntry = keymap.find(e => e.key === 'x');
    expect(rEntry?.action).toBe('rename_tag');
    expect(xEntry?.action).toBe('delete_tag');
  });
});
