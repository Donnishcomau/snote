/**
 * T449 — tags whose names hold control characters or an emoji selector
 * can be opened, renamed and deleted. The actions address the stored
 * name (ui.collection.tagName keeps it verbatim); every place that shows
 * the name shows it sanitised.
 *
 * Key model used (as in the app): `t` opens and focuses the tags pane;
 * `j` there moves the marker AND applies the filter (OPEN_TAG keeps the
 * pane focus); `R` renames and `x` deletes the row under the marker.
 * `\\uFE0F` (a 0-width variation selector) is stripped by
 * `sanitizeForTerminal` but is a real code point for `tagHashOf`.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { tagRows } from '../../src/core/collection';
import { tagHashOf } from '@vendor/utils/tag-hash';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId, TagHash, TagName } from '@vendor/types';

type CollectionView = { type: string; tagName?: string };

const HEART_EMOJI = '\u2764\ufe0flove'; // heart + U+FE0F; sanitises to \u2764love
const ESC_TAG = 'a\x1b[31mb'; // sanitises to 'ab'

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;
const thash = (name: string): TagHash => tagHashOf(tname(name));

// Seed per the task's facts: n1 'Tagged note' with [name], n2 'Other note'
// with none, then the TAG_BUCKET_UPDATE registering the tag on the wire.
function seedStore(name: string) {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n1'),
    note: {
      content: 'Tagged note',
      systemTags: [],
      tags: [tname(name)],
      deleted: false,
      modificationDate: 1000,
      creationDate: 1000,
    },
  } as never);
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n2'),
    note: {
      content: 'Other note',
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: 2000,
      creationDate: 2000,
    },
  } as never);
  store.dispatch({
    type: 'TAG_BUCKET_UPDATE',
    tagHash: thash(name),
    tag: { name, index: 0 },
    isIndexing: false,
  } as never);
  return store;
}

const tagsOf = (store: ReturnType<typeof makeStore>, id: string) =>
  store.getState().data.notes.get(eid(id))?.tags;

describe('T449 tags with control chars / emoji selector addressed by stored name', () => {
  it('1: WHEN n1 is tagged \u2764\ufe0flove and t, j are written THEN ui.collection.tagName is \'\u2764\ufe0flove\' and the frame contains Tagged note and not Other note', async () => {
    const store = seedStore(HEART_EMOJI);
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={120} height={30} />
    );
    try {
      await waitForInput(stdin);
      stdin.write('t');
      await waitForFrame(lastFrame, '>All notes');
      stdin.write('j');
      await waitForFrame(
        lastFrame,
        (f) =>
          f.includes('>\u2764love') &&
          f.includes('>Tagged note') &&
          f.includes('Tagged note') &&
          !f.includes('Other note') &&
          (store.getState().ui.collection as CollectionView).tagName ===
            '\u2764\ufe0flove'
      );
      expect((store.getState().ui.collection as CollectionView).tagName).toBe(
        '\u2764\ufe0flove'
      );
    } finally {
      unmount();
    }
  });

  it('2: WHEN n1 is tagged a\\x1b[31mb and t, j, Enter are written THEN ui.collection.tagName is \'a\\x1b[31mb\', the frame contains Tagged note and tag: ab, and contains no \\x1b', async () => {
    const store = seedStore(ESC_TAG);
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={120} height={30} />
    );
    try {
      await waitForInput(stdin);
      stdin.write('t');
      await waitForFrame(lastFrame, '>All notes');
      stdin.write('j');
      await waitForFrame(lastFrame, '>Tagged note');
      stdin.write('\r');
      await waitForFrame(
        lastFrame,
        (f) =>
          f.includes('Tagged note') &&
          f.includes('tag: ab') &&
          !f.includes('\x1b') &&
          (store.getState().ui.collection as CollectionView).tagName ===
            'a\x1b[31mb'
      );
      expect(lastFrame()).toContain('tag: ab');
      expect((store.getState().ui.collection as CollectionView).tagName).toBe(
        'a\x1b[31mb'
      );
    } finally {
      unmount();
    }
  });

  it('3: WHEN on the \u2764\ufe0flove row R, X, Enter are written THEN n1\'s tags equal [\'\u2764loveX\'] and no tag named \'\u2764\ufe0flove\' remains in data.tags', async () => {
    const store = seedStore(HEART_EMOJI);
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={120} height={30} />
    );
    try {
      await waitForInput(stdin);
      stdin.write('t');
      await waitForFrame(lastFrame, '>All notes');
      stdin.write('j');
      await waitForFrame(lastFrame, '>\u2764love');
      stdin.write('R');
      // the prompt opens with the sanitised name; typed X appends to it
      await waitForFrame(lastFrame, 'rename tag: \u2764love');
      stdin.write('X');
      stdin.write('\r');
      await waitForFrame(
        lastFrame,
        () =>
          JSON.stringify(tagsOf(store, 'n1')) ===
          JSON.stringify(['\u2764loveX'])
      );
      expect(tagsOf(store, 'n1')).toEqual(['\u2764loveX']);
      for (const tag of store.getState().data.tags.values()) {
        expect(tag.name).not.toBe('\u2764\ufe0flove');
      }
    } finally {
      unmount();
    }
  });

  it('4: WHEN on the a\\x1b[31mb row x is written THEN the frame contains delete tag ab? and no \\x1b; after y n1\'s tags equal []', async () => {
    const store = seedStore(ESC_TAG);
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={120} height={30} />
    );
    try {
      await waitForInput(stdin);
      stdin.write('t');
      await waitForFrame(lastFrame, '>All notes');
      stdin.write('j');
      await waitForFrame(lastFrame, '>ab');
      stdin.write('x');
      await waitForFrame(
        lastFrame,
        (f) => f.includes('delete tag ab?') && !f.includes('\x1b')
      );
      stdin.write('y');
      await waitForFrame(
        lastFrame,
        () => JSON.stringify(tagsOf(store, 'n1')) === '[]'
      );
      expect(tagsOf(store, 'n1')).toEqual([]);
    } finally {
      unmount();
    }
  });

  it('5: WHEN n1 is tagged plain and t, j, then R, X, Enter are written THEN ui.collection.tagName was plain and n1\'s tags equal [\'plainX\']', async () => {
    const store = seedStore('plain');
    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={120} height={30} />
    );
    try {
      await waitForInput(stdin);
      stdin.write('t');
      await waitForFrame(lastFrame, '>All notes');
      stdin.write('j');
      await waitForFrame(
        lastFrame,
        () =>
          (store.getState().ui.collection as CollectionView).tagName ===
          'plain'
      );
      expect((store.getState().ui.collection as CollectionView).tagName).toBe(
        'plain'
      );
      stdin.write('R');
      await waitForFrame(lastFrame, 'rename tag');
      stdin.write('X');
      stdin.write('\r');
      await waitForFrame(
        lastFrame,
        () =>
          JSON.stringify(tagsOf(store, 'n1')) === JSON.stringify(['plainX'])
      );
      expect(tagsOf(store, 'n1')).toEqual(['plainX']);
    } finally {
      unmount();
    }
  });

  it('6: WHEN tagRows gets a Map with the tag work\\x1b[31m THEN it returns [\'work\']', () => {
    const tags = new Map([
      [thash('work\x1b[31m'), { name: tname('work\x1b[31m'), index: 0 }],
    ]);
    expect(tagRows(tags)).toEqual(['work']);
  });
});
