import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { initialState } from '../../src/core/simperium-reducer';
import { App } from '../../src/tui/App';
import { StatusBar } from '../../src/tui/StatusBar';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

// Seed 5 notes (note-1 to note-5) including note-2 trashed
function seedStore(store: ReturnType<typeof makeStore>) {
  const notes = [
    { content: 'Pinned note', systemTags: ['pinned'] as const, tags: [] as string[] },
    { content: 'Deleted note', deleted: true, systemTags: [] as const, tags: [] as string[] },
    { content: 'First normal note', systemTags: [] as const, tags: [] as string[] },
    { content: 'Second normal note', systemTags: [] as const, tags: [] as string[] },
    { content: 'Third normal note', systemTags: [] as const, tags: [] as string[] },
  ];
  notes.forEach((note, idx) => {
    const noteId = eid(`note-${idx + 1}`);
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: note as never,
    });
  });
}

// Seed a plain (non-tracking) stub store
function plainStore() {
  return makeStore({ stubClient: {} });
}

// Seed a tracking store
function trackingStore() {
  return makeStore({
    stubClient: {},
    preloadedState: { simperium: { ...initialState, tracking: true } } as never,
  });
}

// Helper: get the status line from a frame (the line containing "notes")
function statusLine(frame: string | undefined): string {
  if (!frame) return '';
  const lines = frame.split('\n');
  const match = lines.find((l) => l.includes('notes'));
  return match?.trim() ?? '';
}

describe('T83 Status bar shows changes waiting to be sent', () => {
  it('1: WHEN the app is rendered with a plain stub store, seeded THEN the status line, trimmed, is exactly [offline] 4 notes and the frame does not contain pending', async () => {
    const store = plainStore();
    seedStore(store);

    const { lastFrame, frames } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame() ?? frames.join('\n');
    expect(statusLine(frame)).toBe('[offline] 4 notes');
    expect(frame).not.toContain('pending');
  });

  it('2: WHEN it is rendered with a tracking store, seeded THEN the status line contains 4 notes 5 pending', async () => {
    const store = trackingStore();
    seedStore(store);

    const { lastFrame, frames } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame() ?? frames.join('\n');
    expect(statusLine(frame)).toContain('4 notes 5 pending');
  });

  it('3: WHEN on that store SUBMIT_PENDING_CHANGE then ACKNOWLEDGE_PENDING_CHANGE (same ccid) and then EDIT_NOTE are dispatched for note-1 THEN after the acknowledgement the frame contains 4 pending, after the edit 5 pending', async () => {
    const store = trackingStore();
    seedStore(store);

    const { lastFrame, frames } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Submit then acknowledge for note-1
    store.dispatch({
      type: 'SUBMIT_PENDING_CHANGE',
      entityId: 'note-1' as never,
      ccid: 'c1',
    });
    store.dispatch({
      type: 'ACKNOWLEDGE_PENDING_CHANGE',
      entityId: 'note-1' as never,
      ccid: 'c1',
    });
    await new Promise((r) => setTimeout(r, 50));

    const frame1 = lastFrame() ?? frames.join('\n');
    expect(frame1).toContain('4 pending');

    // Edit note-1
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note-1' as never,
      changes: { content: 'edited note-1' },
    });
    await new Promise((r) => setTimeout(r, 50));

    const frame2 = lastFrame() ?? frames.join('\n');
    expect(frame2).toContain('5 pending');
  });

  it('4: WHEN all 5 notes were submitted and acknowledged on the tracking store THEN the status line, trimmed, is exactly [offline] 4 notes', async () => {
    const store = trackingStore();
    seedStore(store);

    const { lastFrame, frames } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Submit and acknowledge all 5 notes
    for (let i = 1; i <= 5; i++) {
      store.dispatch({
        type: 'SUBMIT_PENDING_CHANGE',
        entityId: `note-${i}` as never,
        ccid: `c${i}`,
      });
      store.dispatch({
        type: 'ACKNOWLEDGE_PENDING_CHANGE',
        entityId: `note-${i}` as never,
        ccid: `c${i}`,
      });
    }
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame() ?? frames.join('\n');
    expect(statusLine(frame)).toBe('[offline] 4 notes');
  });

  it('5: WHEN CHANGE_CONNECTION_STATUS with status: green is dispatched on the seeded tracking store THEN the status line contains connected and 5 pending and does not contain offline', async () => {
    const store = trackingStore();
    seedStore(store);

    const { lastFrame, frames } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    store.dispatch({
      type: 'CHANGE_CONNECTION_STATUS',
      status: 'green',
    });
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame() ?? frames.join('\n');
    expect(frame).toContain('connected');
    expect(frame).toContain('5 pending');
    expect(frame).not.toContain('offline');
  });

  it('6: WHEN <StatusBar connected={false} count={4} width={80} pending={0} /> and then the same with pending={2} label="trash" are rendered alone THEN the frames, trimmed, are exactly [offline] 4 notes and [offline] 4 notes 2 pending trash', async () => {
    const { lastFrame: lastFrame1, frames: frames1 } = render(
      <StatusBar connected={false} count={4} width={80} pending={0} />
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame1 = lastFrame1() ?? frames1.join('\n');
    expect(statusLine(frame1)).toBe('[offline] 4 notes');

    const { lastFrame: lastFrame2, frames: frames2 } = render(
      <StatusBar connected={false} count={4} width={80} pending={2} label="trash" />
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame2 = lastFrame2() ?? frames2.join('\n');
    expect(statusLine(frame2)).toBe('[offline] 4 notes 2 pending trash');
  });
});
