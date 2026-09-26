import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const writeKey = async (stdin: { write: (s: string) => void }, ch: string) => {
  stdin.write(ch);
  await delay(50);
};

describe('T283 trash view highlights the Trash row in the Tags pane', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    // Fixture: 2 notes, one deleted (deleted: true) so trash is non-empty.
    store = makeStore({ stubClient: {} });
    const notes = [
      ['note-1', makeNote('note-1', 'First note\nFirst body', { modificationDate: 1000 })],
      ['note-2', makeNote('note-2', 'Deleted note\nShould not appear', { deleted: true, modificationDate: 2000 })],
    ] as const;
    for (const [id, note] of notes) {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: eid(id),
        note: {
          content: note.content,
          systemTags: note.systemTags,
          tags: note.tags,
          deleted: note.deleted,
          modificationDate: note.modificationDate,
          creationDate: note.creationDate,
        },
      });
    }
  });

  it("1: WHEN stdin.write('T') is sent THEN the frame contains '>Trash' and does not contain '>All notes', and store.getState().ui.collection equals { type: 'trash' }", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    // Open the tags pane with 't', then unfocus it with Tab so 'T'
    // reaches the generic noteKeyAction handler in App.
    await writeKey(stdin, 't');
    await writeKey(stdin, '\t');

    await writeKey(stdin, 'T');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Trash');
    expect(frame).not.toContain('>All notes');
    expect(store.getState().ui.collection).toEqual({ type: 'trash' });

    stdin.write('\u001b');
  });

  it("2: WHEN stdin.write('T') then, in a separate call, stdin.write('T') again are sent THEN the frame contains '>All notes' and does not contain '>Trash', and store.getState().ui.collection equals { type: 'all' }", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await delay(50);

    await writeKey(stdin, 't');
    await writeKey(stdin, '\t');

    await writeKey(stdin, 'T');
    expect(store.getState().ui.collection).toEqual({ type: 'trash' });

    await writeKey(stdin, 'T');

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>All notes');
    expect(frame).not.toContain('>Trash');
    expect(store.getState().ui.collection).toEqual({ type: 'all' });

    stdin.write('\u001b');
  });
});
