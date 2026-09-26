import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { sharedLine } from '../../src/core/note-keys';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId, TagName } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as TagName;

// Fixture notes for all tests
function buildFixture(): { s1: any; s2: any; s3: any } {
  const s1 = makeNote('s1', 'Team plan', {
    creationDate: 1000,
    modificationDate: 3000,
    tags: ['work', 'ann@example.com', 'bob@example.org'],
  });
  const s2 = makeNote('s2', 'Flagged note', {
    creationDate: 1000,
    modificationDate: 2000,
  }) as any;
  s2.systemTags = ['shared'];
  const s3 = makeNote('s3', 'Private note', {
    creationDate: 1000,
    modificationDate: 1000,
    tags: ['home'],
  });
  return { s1, s2, s3 };
}

function seededStore() {
  const store = makeStore({ stubClient: {} });
  const { s1, s2, s3 } = buildFixture();
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('s1'), note: s1 });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('s2'), note: s2 });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('s3'), note: s3 });
  return store;
}

describe('sharedLine pure helper', () => {
  it('1: WHEN sharedLine gets s1 THEN it returns exactly shared with: ann@example.com, bob@example.org', () => {
    const { s1 } = buildFixture();
    const result = sharedLine(s1);
    expect(result).toBe('shared with: ann@example.com, bob@example.org');
  });

  it('2a: WHEN sharedLine gets s2 THEN it returns shared', () => {
    const { s2 } = buildFixture();
    const result = sharedLine(s2);
    expect(result).toBe('shared');
  });

  it('2b: WHEN sharedLine gets s3 and null THEN it returns null for both', () => {
    const { s3 } = buildFixture();
    expect(sharedLine(s3)).toBeNull();
    expect(sharedLine(null as any)).toBeNull();
  });
});

describe('shared line in BottomArea and email guard in tag editor', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = seededStore();
  });

  it('3: WHEN the app has started (s1 highlighted) THEN the first frame contains shared with: ann@example.com, bob@example.org; after j it matches /shared/m; after j again (s3) it does not contain shared', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // s1 is the first selected (pinned first by modificationDate desc)
    const frame0 = lastFrame();
    expect(frame0).toContain('shared with: ann@example.com, bob@example.org');

    // Press j to move to s2
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));
    const frame1 = lastFrame();
    expect(frame1).toMatch(/^shared$/m);

    // Press j to move to s3
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));
    const frame2 = lastFrame();
    expect(frame2).not.toContain('shared');
  });

  it('4: WHEN g, eve@example.com, and \r are sent THEN s1 tags still have length 3, data.tags has no eve@example.com, and frame still contains tags:', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const noteBefore = store.getState().data.notes.get(eid('s1'));
    expect(noteBefore?.tags).toHaveLength(3);

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('eve@example.com');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const noteAfter = store.getState().data.notes.get(eid('s1'));
    expect(noteAfter?.tags).toHaveLength(3);
    expect(noteAfter?.tags).not.toContain(tname('eve@example.com'));
    expect(store.getState().data.tags.get(eid('eve@example.com'))).toBeUndefined();

    const frame = lastFrame();
    expect(frame).toContain('tags:');
  });

  it('5: WHEN g, todo, and \r are sent THEN s1 tags go from 3 to 4 and include todo, and s3 tags are still exactly home', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const s1Before = store.getState().data.notes.get(eid('s1'));
    expect(s1Before?.tags).toHaveLength(3);

    const s3Before = store.getState().data.notes.get(eid('s3'));
    expect(s3Before?.tags).toEqual([tname('home')]);

    stdin.write('g');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('todo');
    await new Promise((r) => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const s1After = store.getState().data.notes.get(eid('s1'));
    expect(s1After?.tags).toHaveLength(4);
    expect(s1After?.tags).toContain(tname('todo'));

    const s3After = store.getState().data.notes.get(eid('s3'));
    expect(s3After?.tags).toEqual([tname('home')]);
  });
});
