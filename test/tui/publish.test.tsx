import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { keymap } from '../../src/core/keymap';
import type { EntityId, SystemTag } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function seededStore() {
  const store = makeStore({ stubClient: {} });

  const pubId = eid('note-pub');
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: pubId,
    note: {
      content: 'Public note',
      systemTags: ['pinned', 'published' as SystemTag],
      tags: [],
      deleted: false,
      modificationDate: 1000,
      creationDate: 1000,
      publishURL: 'abc123',
    },
  });

  const plainId = eid('note-plain');
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: plainId,
    note: {
      content: 'Plain note',
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: 2000,
      creationDate: 2000,
    },
  });

  return store;
}

describe('Publish link display and copy (y)', () => {
  let store: ReturnType<typeof makeStore>;
  let spy: Mock;

  beforeEach(() => {
    store = seededStore();
    spy = vi.fn(() => true);
  });

  it('1: WHEN the app has started THEN the frame contains published: https://simp.ly/p/abc123, >Public note and 2 notes, and the spy was not called', async () => {
    const { lastFrame } = render(
      <App store={store} width={80} height={24} copyText={spy} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('published: https://simp.ly/p/abc123');
    expect(frame).toContain('>Public note');
    expect(frame).toContain('2 notes');
    expect(spy).not.toHaveBeenCalled();
  });

  it('2: WHEN y and then j are sent THEN after y the spy has one call with https://simp.ly/p/abc123, the frame contains (copied), data.notes is the same Map (toBe); after j the frame has no (copied)', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} copyText={spy} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press y to copy the link
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('https://simp.ly/p/abc123');
    expect(frame).toContain('(copied)');
    expect(frame).toContain('published: https://simp.ly/p/abc123');

    const notesBefore = store.getState().data.notes;

    // Press j to move to the next note
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain('(copied)');
    expect(store.getState().data.notes).toBe(notesBefore);
  });

  it('3: WHEN j then y are sent (note plain, not published) THEN the spy was not called and the frame does not contain published:', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} copyText={spy} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Press j to move to the plain note
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    // Press y on the unpublished note
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(spy).not.toHaveBeenCalled();
    expect(frame).not.toContain('published:');
  });

  it('4: WHEN j, P, y are sent THEN after P note plain has published in systemTags and the frame contains published: waiting for link; after y the spy was still not called', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} copyText={spy} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Move to plain note
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    // Press P to publish the plain note
    stdin.write('P');
    await new Promise((r) => setTimeout(r, 50));

    const noteAfterP = store
      .getState()
      .data.notes.get('note-plain' as unknown as EntityId);
    expect(noteAfterP?.systemTags).toContain('published');

    let frame = lastFrame();
    expect(frame).toContain('published: waiting for link');

    // Press y on the unpublished (no publishURL yet) note
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(spy).not.toHaveBeenCalled();
  });

  it('5: WHEN copyText is vi.fn(() => false) and y is sent THEN the frame contains (copy failed) and does not contain (copied)', async () => {
    const failingSpy = vi.fn(() => false);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} copyText={failingSpy} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('(copy failed)');
    expect(frame).not.toContain('(copied)');
  });

  it('6: WHEN keymap from src/core/keymap.ts is read THEN exactly one entry has the key y, and its action is copy_link', () => {
    const yEntries = keymap.filter((e) => e.key === 'y');
    expect(yEntries.length).toBe(1);
    expect(yEntries[0].action).toBe('copy_link');
  });
});
