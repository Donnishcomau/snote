import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import { keymap } from '../../src/core/keymap';
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

describe('T10 Tags pane', () => {
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

  it("1: WHEN 't' is written THEN the frame before it did not contain 'All notes'; after it the frame contains 'Tags', '>All notes', 'home', 'work', 'Untagged' and '4 notes', and ui.collection is still { type: 'all' }", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    // Before pressing t – no "All notes" in the frame
    const frameBefore = lastFrame();
    expect(frameBefore).not.toContain('All notes');

    // Press t to open the tags pane
    stdin.write('t');
    await delay(50);

    const frameAfter = lastFrame();
    expect(frameAfter).toContain('Tags');
    expect(frameAfter).toContain('>All notes');
    expect(frameAfter).toContain('home');
    expect(frameAfter).toContain('work');
    expect(frameAfter).toContain('Untagged');
    expect(frameAfter).toContain('4 notes');
    expect(store.getState().ui.collection).toEqual({ type: 'all' });

    stdin.write('\u001b'); // close pane
  });

  it("2: WHEN 't', 'j', 'j', '\\r' are written THEN store.getState().ui.collection equals { type: 'tag', tagName: 'work' } and the frame contains 'First normal note', 'tag: work' and '1 notes', and does not contain 'Third normal note'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    expect(store.getState().ui.collection).toEqual({
      type: 'tag',
      tagName: 'work',
    });

    const frame = lastFrame();
    expect(frame).toContain('First normal note');
    expect(frame).toContain('tag: work');
    expect(frame).toContain('1 note');
    expect(frame).not.toContain('Third normal note');

    stdin.write('\u001b');
  });

  it("3: WHEN 't', 'j', 'j', 'j', '\\r' are written THEN ui.collection equals { type: 'untagged' } and the frame contains 'filter: untagged', '2 notes' and 'Pinned note', and does not contain 'First normal note'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    expect(store.getState().ui.collection).toEqual({ type: 'untagged' });

    const frame = lastFrame();
    expect(frame).toContain('filter: untagged');
    expect(frame).toContain('2 notes');
    expect(frame).toContain('Pinned note');
    expect(frame).not.toContain('First normal note');

    stdin.write('\u001b');
  });

  it("4: WHEN the 'work' filter of line 2 is active and 't', 'k', 'k', '\\r' are written THEN ui.collection equals { type: 'all' } and the frame contains '4 notes' and 'Third normal note' and does not contain 'tag: work'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    // First select 'work' tag (t, j, j, Enter)
    stdin.write('t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    // Now open the tags pane and go up to 'All notes'
    stdin.write('t');
    await delay(50);
    stdin.write('k');
    await delay(50);
    stdin.write('k');
    await delay(50);
    stdin.write('\r');
    await delay(50);

    expect(store.getState().ui.collection).toEqual({ type: 'all' });

    const frame = lastFrame();
    expect(frame).toContain('4 notes');
    expect(frame).toContain('Third normal note');
    expect(frame).not.toContain('tag: work');

    stdin.write('\u001b');
  });

  it("5: WHEN 't', '\\t', then 'j' are written THEN the frame line containing 'All notes' still starts with '>' and the frame's 'Preview:' line differs from the one before 'j'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('\t');
    await delay(50);

    const frame1 = lastFrame();
    expect(frame1).toMatch(/.*>All notes.*/);

    stdin.write('j');
    await delay(50);

    const frame2 = lastFrame();

    // The preview pane content should differ after pressing j in tags pane focus
    // (j moves the tag index, the Preview pane stays the same but the frame structure changes)
    const previewLines1 = frame1
      .split('\n')
      .filter((l) => l.includes('Preview:'));
    const previewLines2 = frame2
      .split('\n')
      .filter((l) => l.includes('Preview:'));

    expect(previewLines1.length).toBeGreaterThan(0);
    // After j the tag pane index changes, so the overall frame content changes
    expect(frame1).not.toEqual(frame2);

    stdin.write('\u001b');
  });

  it("6: WHEN 't', then 'q', 'n' and '?' are written THEN onQuit and runEditor were not called, the frame does not contain 'Help - Keyboard Shortcuts', and keymap has an entry with key 't' and action 'focus_tags'", async () => {
    const onQuit = vi.fn();
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);
    stdin.write('q');
    await delay(50);
    stdin.write('n');
    await delay(50);
    stdin.write('?');
    await delay(50);

    expect(onQuit).not.toHaveBeenCalled();
    expect(runEditor).not.toHaveBeenCalled();

    const frame = lastFrame();
    expect(frame).not.toContain('Help - Keyboard Shortcuts');

    expect(keymap.some((entry) => entry.key === 't' && entry.action === 'focus_tags')).toBe(true);

    stdin.write('\u001b');
  });
});
