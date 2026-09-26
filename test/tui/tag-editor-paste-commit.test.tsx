import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId, TagName } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as TagName;

// Fixture: one note t1 with 0 tags; tag editor opened via `g`.
function seedNote(store: ReturnType<typeof makeStore>): void {
  const now = Date.now();
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: {
      content: 'Tagged note',
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: now,
      creationDate: now,
    },
  });
}

function t1Tags(store: ReturnType<typeof makeStore>): TagName[] {
  const note = store.getState().data.notes.get(eid('t1'));
  return note?.tags ?? [];
}

describe('T282 tag editor commits pasted text bunched with Enter', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    seedNote(store);
  });

  it("1: WHEN stdin.write('br1\\r') is sent in one call THEN the frame contains [br1] and the note's stored tags (store.getState().data.notes) equal ['br1']", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));

    // Paste chunk: text + Enter in a single write
    stdin.write('br1\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(lastFrame()).toContain('[br1]');
    const note = store.getState().data.notes.get(eid('t1'));
    expect(note?.tags).toEqual([tname('br1')]);
  });

  it("2: WHEN stdin.write('one\\rtwo\\r') is sent in one call to a note with 0 tags THEN the note's stored tags equal ['one', 'two']", async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));

    stdin.write('one\rtwo\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(t1Tags(store)).toEqual([tname('one'), tname('two')]);
  });

  it("3: WHEN stdin.write('work') then, in a separate call, stdin.write('\\r') are sent THEN the note's stored tags equal ['work']", async () => {
    const { stdin } = render(<App store={store} width={80} height={24} />);

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));

    stdin.write('work');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    expect(t1Tags(store)).toEqual([tname('work')]);
  });

  it("4: WHEN stdin.write('wor') then, in a separate call, stdin.write('\\u001b') are sent with no Enter THEN the note's stored tags are still empty and the frame does not contain 'tags:'", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));

    stdin.write('wor');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\u001b');
    await new Promise((r) => setTimeout(r, 50));

    expect(t1Tags(store)).toEqual([]);
    expect(lastFrame()).not.toContain('tags:');
  });
});
