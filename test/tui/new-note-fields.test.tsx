import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId, Note } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll until the frame looks right; every asserted value is waited for.
async function settle(
  lastFrame: () => string | undefined,
  wanted: (frame: string) => boolean
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (wanted(lastFrame() ?? '')) return;
    await delay(25);
  }
}

const CONTENT = 'Fresh note\nbody';

function seedNotes() {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx + 1}`),
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
  return store;
}

// ADD_NOTE_TAG also creates the tag entry in state.data.tags
function seedTags(store: ReturnType<typeof makeStore>) {
  store.dispatch({ type: 'ADD_NOTE_TAG', noteId: eid('note-3'), tagName: 'work' as never });
  store.dispatch({ type: 'ADD_NOTE_TAG', noteId: eid('note-4'), tagName: 'home' as never });
}

// Open the 'work' tag list: t, j, j, Enter -> '1 note'
async function openWorkList(stdin: { write: (d: string) => void }, lastFrame: () => string | undefined) {
  stdin.write('t');
  await delay(50);
  stdin.write('j');
  await delay(50);
  stdin.write('j');
  await delay(50);
  stdin.write('\r');
  await delay(50);
  expect(lastFrame() ?? '').toContain('1 note');
}

function freshNote(store: ReturnType<typeof makeStore>): Note | undefined {
  return [...store.getState().data.notes.values()].find((n) => n.content === CONTENT);
}

describe('T208 n creates the note with upstream fields', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = seedNotes();
    seedTags(store);
  });

  it("1: WHEN note-1 was made a markdown note and n is written THEN the new note (content `Fresh note\\nbody`) has systemTags equal to `['markdown']` and tags equal to `[]`", async () => {
    store.dispatch({
      type: 'MARKDOWN_NOTE',
      noteId: eid('note-1'),
      shouldEnableMarkdown: true,
    } as never);

    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('>Fresh note'));

    const created = freshNote(store);
    expect(created).toBeDefined();
    expect(created!.systemTags).toEqual(['markdown']);
    expect(created!.tags).toEqual([]);
  });

  it("2: WHEN no note is a markdown note and n is written THEN the new note has systemTags equal to `[]`", async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('>Fresh note'));

    const created = freshNote(store);
    expect(created).toBeDefined();
    expect(created!.systemTags).toEqual([]);
  });

  it("3: WHEN the work list is open and n is written THEN the new note has tags equal to `['work']`, and the frame contains `>Fresh note`, `tag: work` and `2 notes`", async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    await openWorkList(stdin, lastFrame);

    stdin.write('n');
    await settle(
      lastFrame,
      (f) => f.includes('>Fresh note') && f.includes('tag: work') && f.includes('2 notes')
    );

    const created = freshNote(store);
    expect(created).toBeDefined();
    expect(created!.tags).toEqual(['work']);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('>Fresh note');
    expect(frame).toContain('tag: work');
    expect(frame).toContain('2 notes');
  });

  it("4: WHEN the editor resolves null in the work list THEN data.notes is the same Map as before (`toBe`)", async () => {
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    await openWorkList(stdin, lastFrame);

    const before = store.getState().data.notes;
    stdin.write('n');
    await delay(50);
    // with nothing to create, no new frame content ever appears
    await settle(lastFrame, (f) => !f.includes('Fresh note'));

    expect(store.getState().data.notes).toBe(before);
    expect(runEditor).toHaveBeenCalledTimes(1);
  });

  it("5: WHEN src/tui/app-actions.ts is read THEN it contains `newNoteFields(` exactly 1 time and does not contain `systemTags: []`", () => {
    const src = readFileSync(resolve(process.cwd(), 'src/tui/app-actions.ts'), 'utf8');
    expect(src.split('newNoteFields(').length - 1).toBe(1);
    expect(src).not.toContain('systemTags: []');
  });
});
