import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const LEFT = '\u001b[D';
const RIGHT = '\u001b[C';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll until `check` holds; returns the last frame seen. Throws otherwise.
async function framesUntil(
  lastFrame: () => string | undefined,
  check: (f: string) => boolean,
): Promise<string> {
  let last = '';
  for (let i = 0; i < 120; i++) {
    last = lastFrame() ?? '';
    if (check(last)) return last;
    await delay(25);
  }
  throw new Error('condition not met, last frame:\n' + last);
}

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

describe('T348 Left and right arrows move between the panes (tags, list, preview)', () => {
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

  it("1: WHEN '\\u001b[D' (leftArrow) is written from the initial screen (pane closed) THEN the frame contains 'focus: tags' and '>All notes'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write(LEFT);
    await delay(50);

    const frame = await framesUntil(lastFrame, (f) => f.includes('focus: tags') && f.includes('>All notes'));
    expect(frame).toContain('focus: tags');
    expect(frame).toContain('>All notes');
  });

  it("2: WHEN leftArrow and then '\\u001b[C' (rightArrow) are written THEN the frame contains '>All notes' and neither 'focus: tags' nor 'focus: preview', and ui.collection equals { type: 'all' }", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write(LEFT);
    await delay(50);
    stdin.write(RIGHT);
    await delay(50);

    const frame = await framesUntil(
      lastFrame,
      (f) =>
        f.includes('>All notes') &&
        !f.includes('focus: tags') &&
        !f.includes('focus: preview') &&
        JSON.stringify(store.getState().ui.collection) === JSON.stringify({ type: 'all' }),
    );
    expect(frame).toContain('>All notes');
    expect(frame).not.toContain('focus: tags');
    expect(frame).not.toContain('focus: preview');
    expect(store.getState().ui.collection).toEqual({ type: 'all' });
  });

  it("3: WHEN rightArrow is written from the initial screen THEN the frame contains 'focus: preview' and does not contain 'focus: tags'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write(RIGHT);
    await delay(50);

    const frame = await framesUntil(lastFrame, (f) => f.includes('focus: preview') && !f.includes('focus: tags'));
    expect(frame).toContain('focus: preview');
    expect(frame).not.toContain('focus: tags');
  });

  it("4: WHEN rightArrow and then leftArrow are written THEN the frame contains neither 'focus: preview' nor 'focus: tags' and does not contain 'All notes' (the tags pane was not opened)", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write(RIGHT);
    await delay(50);
    stdin.write(LEFT);
    await delay(50);

    const frame = await framesUntil(
      lastFrame,
      (f) => !f.includes('focus: preview') && !f.includes('focus: tags') && !f.includes('All notes'),
    );
    expect(frame).not.toContain('focus: preview');
    expect(frame).not.toContain('focus: tags');
    expect(frame).not.toContain('All notes');
  });

  it("5: WHEN the App is rendered at width '100' and leftArrow, rightArrow, rightArrow are written THEN the frames are in turn 'focus: tags', neither focus line, 'focus: preview', and 'All notes' is in every frame", async () => {
    const { stdin, lastFrame, frames } = render(
      <App store={store} width={100} height={24} />
    );

    await delay(50);

    // At width 100 with seeded tags the pane auto-opens once, before any
    // keystroke. Wait for it, remember how many frames exist by then, and
    // every frame from then on must contain 'All notes' (it is never closed).
    const opened = await framesUntil(lastFrame, (f) => f.includes('All notes'));
    expect(opened).toContain('All notes');
    const firstOpen = frames.length;

    stdin.write(LEFT);
    await delay(50);
    const f1 = await framesUntil(
      lastFrame,
      (f) => f.includes('focus: tags') && !f.includes('focus: preview') && f.includes('All notes'),
    );
    expect(f1).toContain('focus: tags');

    stdin.write(RIGHT);
    await delay(50);
    const f2 = await framesUntil(
      lastFrame,
      (f) => !f.includes('focus: tags') && !f.includes('focus: preview') && f.includes('All notes'),
    );
    expect(f2).not.toContain('focus: tags');
    expect(f2).not.toContain('focus: preview');

    stdin.write(RIGHT);
    await delay(50);
    const f3 = await framesUntil(
      lastFrame,
      (f) => f.includes('focus: preview') && !f.includes('focus: tags') && f.includes('All notes'),
    );
    expect(f3).toContain('focus: preview');

    for (const f of frames.slice(firstOpen - 1)) expect(f).toContain('All notes');
  });
});
