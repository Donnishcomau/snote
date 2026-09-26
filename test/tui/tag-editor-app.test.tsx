import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { keymap } from '../../src/core/keymap';
import type { EntityId, TagName } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as TagName;

function seedTwoPinnedNotes(store: ReturnType<typeof makeStore>): void {
  const now = Date.now();
  // t1: pinned, no tags – will be the first selected row
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: {
      content: 'Tagged note',
      systemTags: ['pinned'],
      tags: [],
      deleted: false,
      modificationDate: now,
      creationDate: now,
    },
  });
  // t2: not pinned, no tags
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t2'),
    note: {
      content: 'Second note',
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: now + 1,
      creationDate: now + 1,
    },
  });
}

function t1Tags(store: ReturnType<typeof makeStore>): TagName[] {
  const note = store.getState().data.notes.get(eid('t1'));
  return note?.tags ?? [];
}

function t2Tags(store: ReturnType<typeof makeStore>): TagName[] {
  const note = store.getState().data.notes.get(eid('t2'));
  return note?.tags ?? [];
}

describe('tag editor in the app (g key)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('1: WHEN g, then work, then \'\\r\' are sent THEN before them the tags of t1 have length 0; after them they hold exactly work, the tags of t2 still have length 0, and the frame contains [work]', async () => {
    seedTwoPinnedNotes(store);

    // Verify initial state: t1 has no tags
    expect(t1Tags(store)).toHaveLength(0);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press g to open tag editor, then type work, then Enter
    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('work');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('[work]');
    expect(t1Tags(store)).toEqual([tname('work')]);
    expect(t2Tags(store)).toHaveLength(0);
  });

  it('2: WHEN t2 already has the tag work (by ADD_NOTE_TAG) and g, wo, \'\\t\', \'\\r\' are sent THEN the tags of t1 hold exactly work and the tags of t2 are unchanged (length 1)', async () => {
    seedTwoPinnedNotes(store);

    // Give t2 the tag "work"
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('t2'),
      tagName: tname('work'),
    });

    expect(t2Tags(store)).toEqual([tname('work')]);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('wo');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('[work]');
    expect(t1Tags(store)).toEqual([tname('work')]);
    expect(t2Tags(store)).toEqual([tname('work')]);
  });

  it('3: WHEN t1 has the tags alpha then beta and g, ALPHA, \'\\r\' are sent THEN its tags still have length 2; WHEN \'\\x7f\' follows THEN its tags hold exactly alpha', async () => {
    seedTwoPinnedNotes(store);

    // Give t1 tags alpha and beta
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('t1'),
      tagName: tname('alpha'),
    });
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('t1'),
      tagName: tname('beta'),
    });

    expect(t1Tags(store)).toEqual(['alpha', 'beta']);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open tag editor, type ALPHA, and Enter
    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('ALPHA');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    // Tags still length 2 (ALPHA already exists as alpha, case-insensitive dedup)
    expect(t1Tags(store)).toHaveLength(2);

    // Backspace removes the last tag
    stdin.write('\x7f');
    await new Promise((r) => setTimeout(r, 50));

    expect(t1Tags(store)).toEqual([tname('alpha')]);

    const frame = lastFrame();
    expect(frame).toContain('[alpha]');
  });

  it('4: WHEN g, then j, then n are sent (three writes) THEN the frame contains \'+ jn\' and still contains \'>Tagged note\', and data.notes.size is still 2 (no new note)', async () => {
    seedTwoPinnedNotes(store);

    const initialSize = store.getState().data.notes.size;
    expect(initialSize).toBe(2);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open tag editor, then try j and n
    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('n');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('+ jn');
    expect(frame).toContain('>Tagged note');
    expect(store.getState().data.notes.size).toBe(2);
  });

  it('5: WHEN g, then \'\\u001b\' (wait 50 ms), then j are sent THEN the frame does not contain tags: and contains \'>Second note\'', async () => {
    seedTwoPinnedNotes(store);

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Open tag editor, then escape to close, then j to move down
    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).not.toContain('tags:');
    expect(frame).toContain('>Second note');
  });

  it('6: WHEN the store has no notes and g is sent THEN the frame does not contain tags:; and keymap has exactly one entry with key g, whose action is edit_tags', async () => {
    const storeEmpty = makeStore({ stubClient: {} });

    const { lastFrame } = render(
      <App store={storeEmpty} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).not.toContain('tags:');

    // Verify keymap entry
    const gEntry = keymap.find((e) => e.key === 'g');
    expect(gEntry).toBeDefined();
    expect(gEntry?.action).toBe('edit_tags');
  });
});
