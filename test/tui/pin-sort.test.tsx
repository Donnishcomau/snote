import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('T43: Pinned marker and sort mode in the status bar', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed notes in the store with all properties including dates
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
  });

  it('1: WHEN j then p are sent THEN before p the frame contains Pinned note * and not Third normal note *, after it note-5 has pinned in systemTags, note-4 has not, and the frame contains Third normal note *', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Move to first note (Pinned note)
    let frame = lastFrame();
    expect(frame).toContain('Pinned note *');
    expect(frame).not.toContain('Third normal note *');

    // j: move down to Third normal note (second item)
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    // p: pin note-5 (Third normal note)
    stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('Third normal note *');

    const note5 = store.getState().data.notes.get('note-5' as never);
    const note4 = store.getState().data.notes.get('note-4' as never);
    expect(note5?.systemTags.includes('pinned')).toBe(true);
    expect(note4?.systemTags.includes('pinned')).toBe(false);
  });

  it('2: WHEN p is sent right after start THEN note-1 went from having pinned in systemTags to not having it, the frame no longer contains Pinned note *, and still contains >Pinned note and 4 notes', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const note1Before = store.getState().data.notes.get('note-1' as never);
    expect(note1Before?.systemTags.includes('pinned')).toBe(true);

    let frame = lastFrame();
    expect(frame).toContain('Pinned note *');

    // p: unpin note-1
    stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));

    const note1After = store.getState().data.notes.get('note-1' as never);
    expect(note1After?.systemTags.includes('pinned')).toBe(false);

    frame = lastFrame();
    expect(frame).not.toContain('Pinned note *');
    expect(frame).toMatch(/>Pinned note/);
    expect(frame).toContain('4 notes');
  });

  it('3: WHEN m is sent twice right after start THEN after the first note-1 has markdown in systemTags, after the second it has not, and pinned is still there both times', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // First m: enable markdown on note-1
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));

    const note1AfterFirst = store.getState().data.notes.get('note-1' as never);
    expect(note1AfterFirst?.systemTags).toContain('markdown');
    expect(note1AfterFirst?.systemTags).toContain('pinned');

    // Second m: disable markdown on note-1
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));

    const note1AfterSecond = store.getState().data.notes.get('note-1' as never);
    expect(note1AfterSecond?.systemTags).toContain('pinned');
    expect(note1AfterSecond?.systemTags).not.toContain('markdown');
  });

  it('4: WHEN s is sent three times THEN before the first the frame has no sort:, after the first it contains 4 notes sort: created, after the second sort: a-z, after the third no sort: again', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).not.toContain('sort:');

    // First s: cycle to creationDate
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('4 notes sort: created');

    // Second s: cycle to alphabetical
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('sort: a-z');

    // Third s: cycle back to modificationDate (default, no sort: shown)
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain('sort:');
  });

  it('5: WHEN s, s and then S are sent THEN after s, s the frame order is Pinned note, First normal note, Second normal note, Third normal note; after S it contains sort: a-z (rev) and the order is Pinned note, Third, Second, First', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // First s: creationDate
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    // Second s: alphabetical
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    const pinnedIdx = frame.indexOf('Pinned note');
    const firstIdx = frame.indexOf('First normal note');
    const secondIdx = frame.indexOf('Second normal note');
    const thirdIdx = frame.indexOf('Third normal note');
    expect(pinnedIdx).toBeLessThan(firstIdx);
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);

    // S: reverse sort
    stdin.write('S');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('sort: a-z (rev)');

    const pinnedIdx2 = frame.indexOf('Pinned note');
    const thirdIdx2 = frame.indexOf('Third normal note');
    const secondIdx2 = frame.indexOf('Second normal note');
    const firstIdx2 = frame.indexOf('First normal note');
    expect(pinnedIdx2).toBeLessThan(thirdIdx2);
    expect(thirdIdx2).toBeLessThan(secondIdx2);
    expect(secondIdx2).toBeLessThan(firstIdx2);
  });

  it('6: WHEN T and then s are sent THEN after T the frame line with 1 notes contains trash and no sort:, after s that line contains trash  sort: created', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // T: enter trash view
    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    // Should have 1 note in trash
    expect(frame).toContain('1 notes');
    expect(frame).toContain('trash');
    expect(frame).not.toContain('sort:');

    // s: cycle sort (still in trash)
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('trash  sort: created');
  });
});
