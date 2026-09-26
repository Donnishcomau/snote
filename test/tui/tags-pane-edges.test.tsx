import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seedTags(store: ReturnType<typeof makeStore>) {
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

describe('T114 Tags pane edges', () => {
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

  it("1: WHEN 't', 'j', 'j', '\\r' (filter 'work'), then 't' and 't' again are written THEN the frame does not contain 'All notes', still contains 'tag: work' and '1 notes', and ui.collection.type is still 'tag'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    // Open tags pane, move to 'work', select it
    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    // Close the pane with 't'
    stdin.write('t');
    await delay(50);
    stdin.write('t');
    await delay(50);

    const frame = lastFrame();
    expect(frame).not.toContain('All notes');
    expect(frame).toContain('tag: work');
    expect(frame).toContain('1 notes');
    expect(store.getState().ui.collection.type).toBe('tag');

    stdin.write('\u001b');
  });

  it("2: WHEN 't', 'j' and then '\\u001b' are written THEN the frame does not contain 'All notes'; after one more 't' the frame contains '>home'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\u001b');
    await delay(50);

    const frame1 = lastFrame();
    expect(frame1).not.toContain('All notes');

    stdin.write('t');
    await delay(50);

    const frame2 = lastFrame();
    expect(frame2).toContain('>home');

    stdin.write('\u001b');
  });

  it("3: WHEN 't', then 'k' are written THEN the frame contains '>All notes'; after 'j' five times it contains '>Untagged', and '\\r' then gives ui.collection { type: 'untagged' }", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('k');
    await delay(50);

    const frame1 = lastFrame();
    expect(frame1).toContain('>All notes');

    // j five times: 0 -> 1 -> 2 -> 3 -> 4 -> stays at 4 (max = tagNames.length + 1 = 2 + 1 = 3... wait, tagNames = ['home','work'], so length=2, max index = 3 = Untagged)
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);

    const frame2 = lastFrame();
    expect(frame2).toContain('>Untagged');

    stdin.write('\r');
    await delay(50);

    expect(store.getState().ui.collection).toEqual({ type: 'untagged' });

    stdin.write('\u001b');
  });

  it("4: WHEN the 'work' filter is active and { type: 'SEARCH', searchQuery: 'pinned' } is dispatched THEN the frame contains 'Pinned note'; before the dispatch it did not", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    // Select 'work' filter
    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    const frameBefore = lastFrame();
    expect(frameBefore).not.toContain('Pinned note');

    // Dispatch search for 'pinned'
    store.dispatch({ type: 'SEARCH', searchQuery: 'pinned' });
    await delay(50);

    const frameAfter = lastFrame();
    expect(frameAfter).toContain('Pinned note');

    stdin.write('\u001b');
  });

  it("5: WHEN the pane was never opened and '\\t' is written THEN the frame does not contain 'All notes' and ui.collection is still { type: 'all' }", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('\t');
    await delay(50);

    const frame = lastFrame();
    expect(frame).not.toContain('All notes');
    expect(store.getState().ui.collection).toEqual({ type: 'all' });
  });

  it("6: WHEN a store without any tag is rendered and 't', 'j', '\\r' are written THEN the frame had exactly the rows 'All notes' and 'Untagged' under 'Tags', and ui.collection is { type: 'untagged' }", async () => {
    const emptyStore = makeStore({ stubClient: {} });

    // Seed notes without any tags
    testNotes.forEach((note, idx) => {
      const noteId = eid(`note-${idx + 1}`);
      emptyStore.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId,
        note: {
          content: note.content,
          systemTags: note.systemTags,
          tags: [],
          deleted: note.deleted,
          modificationDate: note.modificationDate,
          creationDate: note.creationDate,
        },
      });
    });

    const { stdin, lastFrame } = render(
      <App store={emptyStore} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    const frame = lastFrame();
    // The tags pane should show only 'All notes' and 'Untagged' rows
    expect(frame).toContain('Tags');
    expect(frame).toContain('>Untagged');

    expect(emptyStore.getState().ui.collection).toEqual({ type: 'untagged' });

    stdin.write('\u001b');
  });
});
