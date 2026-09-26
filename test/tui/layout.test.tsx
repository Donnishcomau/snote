import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function seedThreeNotesWithTag(store: ReturnType<typeof makeStore>) {
  const l1 = eid('l1');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: l1,
    note: makeNote('l1', 'Alpha note', { tags: ['work'] }),
  });
  const l2 = eid('l2');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: l2,
    note: makeNote('l2', 'Beta note'),
  });
  const l3 = eid('l3');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: l3,
    note: makeNote('l3', 'Gamma note'),
  });
}

function seedThreeNotesWithoutTags(store: ReturnType<typeof makeStore>) {
  const l1 = eid('l1');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: l1,
    note: makeNote('l1', 'Alpha note', { tags: [] }),
  });
  const l2 = eid('l2');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: l2,
    note: makeNote('l2', 'Beta note', { tags: [] }),
  });
  const l3 = eid('l3');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: l3,
    note: makeNote('l3', 'Gamma note', { tags: [] }),
  });
}

function seedWithImportedNote(store: ReturnType<typeof makeStore>, id: string, content: string, tags: string[]) {
  // Create the note first so it appears in the list
  const eid_ = id as unknown as EntityId;
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid_,
    note: makeNote(id, content, { tags }),
  });
  // Then IMPORT so the tag gets registered in state.data.tags
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid_,
    note: makeNote(id, content, { tags }),
  });
}

describe('T79 Three panes by default on wide terminals', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    seedThreeNotesWithTag(store);
  });

  it('1: WHEN the app is rendered with tags at width 100 THEN without any key the frame contains All notes, Alpha note and Preview; after q is written onQuit was called once', async () => {
    const onQuit = vi.fn();
    const { stdin, lastFrame } = render(
      <App store={store} width={100} height={24} onQuit={onQuit} />
    );

    await vi.waitFor(
      () => {
        const frame = lastFrame();
        expect(frame).toContain('All notes');
        expect(frame).toContain('Alpha note');
        expect(frame).toContain('Preview');
      },
      { timeout: 2000 }
    );

    stdin.write('q');
    await vi.waitFor(() => {
      expect(onQuit).toHaveBeenCalledTimes(1);
    }, { timeout: 2000 });
  });

  it('2: WHEN it is rendered without tags at width 120 and then note l4 (Delta note, tag home) is imported THEN before the import the frame has no All notes; after it the frame contains All notes and home', async () => {
    const store2 = makeStore({ stubClient: {} });
    seedThreeNotesWithoutTags(store2);
    const { stdin, lastFrame } = render(
      <App store={store2} width={120} height={24} />
    );

    await vi.waitFor(() => {
      const frameBefore = lastFrame();
      expect(frameBefore).not.toContain('All notes');
    }, { timeout: 2000 });

    // Import note with tag home
    seedWithImportedNote(store2, 'l4', 'Delta note', ['home']);
    await vi.waitFor(() => {
      const frameAfter = lastFrame();
      expect(frameAfter).toContain('All notes');
      expect(frameAfter).toContain('home');
    }, { timeout: 2000 });
  });

  it('3: WHEN it is rendered with tags at width 99 THEN the frame does not contain All notes; after t is written it contains All notes, Alpha note and Preview', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={99} height={24} />
    );

    await vi.waitFor(() => {
      const frameBefore = lastFrame();
      expect(frameBefore).not.toContain('All notes');
    }, { timeout: 2000 });

    stdin.write('t');
    await vi.waitFor(() => {
      const frameAfter = lastFrame();
      expect(frameAfter).toContain('All notes');
      expect(frameAfter).toContain('Alpha note');
      expect(frameAfter).toContain('Preview');
    }, { timeout: 2000 });
  });

  it('4: WHEN it is rendered with tags at width 60 and t, then Escape are written THEN after t the frame contains All notes and Alpha note but not Preview; after Escape it contains Preview and not All notes', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={60} height={24} />
    );

    stdin.write('t');
    await vi.waitFor(() => {
      const frameAfterT = lastFrame();
      expect(frameAfterT).toContain('All notes');
      expect(frameAfterT).toContain('Alpha note');
      expect(frameAfterT).not.toContain('Preview');
    }, { timeout: 2000 });

    stdin.write('\u001b');
    await vi.waitFor(() => {
      const frameAfterEscape = lastFrame();
      expect(frameAfterEscape).toContain('Preview');
      expect(frameAfterEscape).not.toContain('All notes');
    }, { timeout: 2000 });
  });

  it('5: WHEN it is rendered with tags at width 40 and t is written THEN before t the frame contains Alpha note, not Preview, and no frame line is longer than 40 characters; after t it contains All notes and not Alpha note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={40} height={24} />
    );

    await vi.waitFor(() => {
      const frameBefore = lastFrame();
      expect(frameBefore).toContain('Alpha note');
      expect(frameBefore).not.toContain('Preview');
      const linesBefore = frameBefore.split('\n');
      for (const line of linesBefore) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    }, { timeout: 2000 });

    stdin.write('t');
    await vi.waitFor(() => {
      const frameAfter = lastFrame();
      expect(frameAfter).toContain('All notes');
      expect(frameAfter).not.toContain('Alpha note');
    }, { timeout: 2000 });
  });

  it('6: WHEN it is rendered with tags at width 120, t then Escape are written and then a note l5 (Delta note, tag zoo) is imported THEN the frame contains neither All notes nor zoo', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={120} height={24} />
    );

    await vi.waitFor(() => {
      expect(lastFrame()).toContain('All notes');
    }, { timeout: 2000 });

    // Auto-open tags (width >= 100, tags exist)
    // Close it
    stdin.write('t');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('focus: tags');
    }, { timeout: 2000 });
    stdin.write('\u001b');
    await vi.waitFor(() => {
      expect(lastFrame()).not.toContain('focus: tags');
    }, { timeout: 2000 });

    // Now import note with new tag
    seedWithImportedNote(store, 'l5', 'Delta note', ['zoo']);
    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).not.toContain('All notes');
      expect(frame).not.toContain('zoo');
    }, { timeout: 2000 });
  });
});
