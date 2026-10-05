import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seedTags(store: ReturnType<typeof makeStore>) {
  // ADD_NOTE_TAG also creates the tag entry in state.data.tags
  store.dispatch({
    type: 'ADD_NOTE_TAG',
    noteId: eid('note-3'),
    tagName: 'work' as any,
  });
  store.dispatch({
    type: 'ADD_NOTE_TAG',
    noteId: eid('note-4'),
    tagName: 'home' as any,
  });
}

const writeKey = async (stdin: { write: (s: string) => void }, ch: string) => {
  stdin.write(ch);
  await delay(50);
};

describe('T347 Tags pane live filter', () => {
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

    seedTags(store);
  });

  it("1: WHEN 't' then 'j' are written THEN ui.collection equals { type: 'tag', tagName: 'home' }, the frame contains '>home', 'Second normal note', '1 notes' and 'focus: tags', and not 'First normal note'", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');

    expect(store.getState().ui.collection).toEqual({ type: 'tag', tagName: 'home' });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>home');
    expect(frame).toContain('Second normal note');
    expect(frame).toContain('1 notes');
    expect(frame).toContain('focus: tags');
    expect(frame).not.toContain('First normal note');

    stdin.write('\u001b');
  });

  it("2: WHEN 't', 'j', 'k' are written THEN after 'j' the collection is { type: 'tag', tagName: 'home' }, and after 'k' it equals { type: 'all' } with the frame containing '>All notes' and '4 notes'", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');

    expect(store.getState().ui.collection).toEqual({ type: 'tag', tagName: 'home' });

    await writeKey(stdin, 'k');

    expect(store.getState().ui.collection).toEqual({ type: 'all' });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>All notes');
    expect(frame).toContain('4 notes');

    stdin.write('\u001b');
  });

  it("3: WHEN 't' and then 'j' four times are written THEN the collection equals { type: 'untagged' } and the frame contains '>Trash'; after '\\r' the collection equals { type: 'trash' }", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');

    expect(store.getState().ui.collection).toEqual({ type: 'untagged' });
    expect(lastFrame()).toContain('>Trash');

    await writeKey(stdin, '\r');

    expect(store.getState().ui.collection).toEqual({ type: 'trash' });

    stdin.write('\u001b');
  });

  it("4: WHEN 'j', then 't', then 'j' three times are written THEN the frame contains '>Pinned note' and '2 notes' and not '>Third normal note' (the selection went back to the top of the filtered list)", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 'j');
    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Pinned note');
    expect(frame).toContain('2 notes');
    expect(frame).not.toContain('>Third normal note');

    stdin.write('\u001b');
  });

  it("5: WHEN 't', 'j', '\\r' are written THEN the collection is { type: 'tag', tagName: 'home' } before and after '\\r', the frame has neither 'focus: tags' nor 'focus: preview', and data.notes is the same Map (toBe)", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');

    expect(store.getState().ui.collection).toEqual({ type: 'tag', tagName: 'home' });

    const notesBefore = store.getState().data.notes;

    await writeKey(stdin, '\r');

    expect(store.getState().ui.collection).toEqual({ type: 'tag', tagName: 'home' });

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('focus: tags');
    expect(frame).not.toContain('focus: preview');
    expect(store.getState().data.notes).toBe(notesBefore);

    stdin.write('\u001b');
  });

  it("6: WHEN 't', 'j', Escape are written THEN the collection equals { type: 'tag', tagName: 'home' }, the frame contains 'tag: home' and does not contain 'All notes' (pane closed)", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');
    await writeKey(stdin, '\u001b');

    expect(store.getState().ui.collection).toEqual({ type: 'tag', tagName: 'home' });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('tag: home');
    expect(frame).not.toContain('All notes');
  });
});
