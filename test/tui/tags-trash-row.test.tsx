import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { readFileSync } from 'node:fs';

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

const writeKey = async (stdin: { write: (s: string) => void }, ch: string) => {
  stdin.write(ch);
  await delay(50);
};



describe('T184 Tags pane trash row', () => {
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

  it("1: WHEN 't' is written THEN the frame contains 'All notes', 'home', 'work', 'Untagged' and 'Trash', ui.collection is still { type: 'all' } and the frame contains '4 notes'", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('All notes');
    expect(frame).toContain('home');
    expect(frame).toContain('work');
    expect(frame).toContain('Untagged');
    expect(frame).toContain('Trash');
    expect(store.getState().ui.collection).toEqual({ type: 'all' });
    expect(frame).toContain('4 notes');

    stdin.write('\u001b');
  });

  it("2: WHEN 't', then 'j' 4 times, then '\\r' are written THEN before Enter the frame contains '>Trash'; after it ui.collection equals { type: 'trash' }, the frame contains 'Deleted note' and '1 notes' and not 'Third normal note', and data.notes is the same Map as before (toBe)", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');

    const beforeEnter = lastFrame() ?? '';
    expect(beforeEnter).toContain('>Trash');

    const notesBefore = store.getState().data.notes;

    await writeKey(stdin, '\r');

    expect(store.getState().ui.collection).toEqual({ type: 'trash' });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Deleted note');
    expect(frame).toContain('1 note');
    expect(frame).not.toContain('Third normal note');
    expect(store.getState().data.notes).toBe(notesBefore);

    stdin.write('\u001b');
  });

  it("3: WHEN after line 2 't', then 'k' 4 times, then '\\r' are written THEN ui.collection equals { type: 'all' } and the frame contains '4 notes' and 'Third normal note' and not 'Deleted note'", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    // Line 2: into the trash via the Trash row (Enter left the focus on the list)
    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, '\r');
    expect(store.getState().ui.collection).toEqual({ type: 'trash' });

    // Line 3: 't' refocuses the tags pane on the Trash row, 'k' x4 back to 'All notes'
    await writeKey(stdin, 't');
    expect(lastFrame()).toContain('>Trash');
    await writeKey(stdin, 'k');
    await writeKey(stdin, 'k');
    await writeKey(stdin, 'k');
    await writeKey(stdin, 'k');
    expect(lastFrame()).toContain('>All notes');

    await writeKey(stdin, '\r');

    expect(store.getState().ui.collection).toEqual({ type: 'all' });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('4 notes');
    expect(frame).toContain('Third normal note');
    expect(frame).not.toContain('Deleted note');

    stdin.write('\u001b');
  });

  it("4: WHEN 't' and then 'j' 7 times are written THEN the frame still contains '>Trash' (the marker stays on the last row) and ui.collection equals { type: 'untagged' }", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    for (let i = 0; i < 7; i++) {
      await writeKey(stdin, 'j');
    }

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Trash');
    expect(store.getState().ui.collection).toEqual({ type: 'untagged' });

    stdin.write('\u001b');
  });

  it("5: WHEN 't', 'j' 4 times, then 'R', 'x', 'J', 'K' are written THEN no frame after any of these keys contains 'rename tag:' or 'delete tag', and data.tags is the same Map as before 'R' (toBe)", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');
    await writeKey(stdin, 'j');

    const tagsBefore = store.getState().data.tags;

    for (const ch of ['R', 'x', 'J', 'K']) {
      await writeKey(stdin, ch);
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('rename tag:');
      expect(frame).not.toContain('delete tag');
    }

    expect(store.getState().data.tags).toBe(tagsBefore);

    stdin.write('\u001b');
  });

  it("6: WHEN 'T' is written with the pane closed THEN ui.collection equals { type: 'trash' }; after 'T' again it equals { type: 'all' }; and src/tui/app-keys.ts contains 'SELECT_TRASH' exactly 1 time", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 'T');
    expect(store.getState().ui.collection).toEqual({ type: 'trash' });

    await writeKey(stdin, 'T');
    expect(store.getState().ui.collection).toEqual({ type: 'all' });

    expect(lastFrame()).toBeDefined();

    const appKeys = readFileSync('src/tui/app-keys.ts', 'utf8');
    expect(appKeys.match(/SELECT_TRASH/g)).toHaveLength(1);

    stdin.write('\u001b');
  });
});
