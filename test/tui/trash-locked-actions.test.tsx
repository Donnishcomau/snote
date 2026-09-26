import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('Trash locked actions', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // One note (id note-1, tags ['work'], not deleted yet); d trashes it
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-1'),
      note: makeNote('note-1', 'Trashed note\nDeleted content', {
        tags: ['work'],
      }),
    });
  });

  // Seed the trash view: d trashes note-1, T opens the trash collection
  const enterTrash = async (stdin: { write: (s: string) => void }, lastFrame: () => string | undefined) => {
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('d');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().data.notes.get('note-1' as never)?.deleted).toBe(true);
    expect(lastFrame()).toContain('Trashed note');
  };

  it('1: WHEN T then g are written on a store seeded with one trashed note (id note-1, tags: [work]) THEN the frame does not contain tags: , store.getState().data.notes.get("note-1")?.tags is still ["work"], and the frame contains In trash: press u to restore first', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    // Seed the trash view, then press g (tag editor)
    await enterTrash(stdin, lastFrame);
    stdin.write('g');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Trashed note');
    expect(frame).not.toContain('tags: ');
    expect(store.getState().data.notes.get('note-1' as never)?.tags).toEqual(['work']);
    expect(frame).toContain('In trash: press u to restore first');
  });

  it('2: WHEN T then p are written THEN store.getState().data.notes.get("note-1")?.systemTags is still [], and the frame contains In trash: press u to restore first', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await enterTrash(stdin, lastFrame);
    stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.get('note-1' as never)?.systemTags).toEqual([]);
    expect(lastFrame()).toContain('In trash: press u to restore first');
  });

  it('3: WHEN T then P are written THEN store.getState().data.notes.get("note-1")?.systemTags is still [], and the frame contains In trash: press u to restore first', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await enterTrash(stdin, lastFrame);
    stdin.write('P');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.get('note-1' as never)?.systemTags).toEqual([]);
    expect(lastFrame()).toContain('In trash: press u to restore first');
  });

  it('4: WHEN T then m are written THEN store.getState().data.notes.get("note-1")?.systemTags is still [], and the frame contains In trash: press u to restore first', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await enterTrash(stdin, lastFrame);
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.get('note-1' as never)?.systemTags).toEqual([]);
    expect(lastFrame()).toContain('In trash: press u to restore first');
  });

  it('5: WHEN T then h are written THEN store.getState().ui.showRevisions is still false, store.getState().ui.openedNote is still null, the frame does not contain History, and the frame contains In trash: press u to restore first', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await enterTrash(stdin, lastFrame);
    stdin.write('h');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().ui.showRevisions).toBe(false);
    expect(store.getState().ui.openedNote).toBe(null);
    const frame = lastFrame();
    expect(frame).not.toContain('History');
    expect(frame).toContain('In trash: press u to restore first');
  });

  it('6: WHEN T then u are written THEN store.getState().data.notes.get("note-1")?.deleted goes from true to false', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await enterTrash(stdin, lastFrame);

    stdin.write('u');
    await new Promise((r) => setTimeout(r, 50));

    expect(store.getState().data.notes.get('note-1' as never)?.deleted).toBe(false);
  });
});
