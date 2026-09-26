import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';

import { makeStore } from '../../src/core/store';
import { useAppState } from '../../src/tui/useAppState';
import { testNotes } from '../tui/fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

function Probe({ store }: { store: ReturnType<typeof makeStore> }) {
  const v = useAppState(store);
  return (
    <Text>
      {'n=' + v.noteEntries.length + ' first=' + (v.noteEntries[0]?.id ?? '-') + ' q=' + v.query + ' tags=' + v.tagNames.join(',') + ' sel=' + v.selectedIndex}
    </Text>
  );
}

describe('split-state', () => {
  let store: ReturnType<typeof makeStore>;

  it('1: WHEN Probe is rendered THEN the frame contains n=4 first=note-1 and sel=0 and tags= sel', async () => {
    store = makeStore({ stubClient: {} });
    testNotes.forEach((note, idx) => {
      const noteId = eid('note-' + (idx + 1));
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
    const { lastFrame } = render(<Probe store={store} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('n=4 first=note-1');
    expect(frame).toContain('sel=0');
    expect(frame).toContain('tags= sel');
  });

  it('2: WHEN SEARCH with second is dispatched THEN the frame contains n=1 first=note-4 and q=second; WHEN SEARCH with empty string follows THEN it contains n=4 first=note-1 again', async () => {
    store = makeStore({ stubClient: {} });
    testNotes.forEach((note, idx) => {
      const noteId = eid('note-' + (idx + 1));
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
    const { lastFrame } = render(<Probe store={store} />);
    await new Promise(r => setTimeout(r, 50));
    store.dispatch({ type: 'SEARCH', searchQuery: 'second' });
    await new Promise(r => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toContain('n=1 first=note-4');
    expect(frame).toContain('q=second');
    store.dispatch({ type: 'SEARCH', searchQuery: '' });
    await new Promise(r => setTimeout(r, 50));
    frame = lastFrame();
    expect(frame).toContain('n=4 first=note-1');
  });

  it('3: WHEN ADD_NOTE_TAG for note-3 with work is dispatched THEN the frame contains tags=work and n=4 first=note-1, and data.notes.size is still 5', async () => {
    store = makeStore({ stubClient: {} });
    testNotes.forEach((note, idx) => {
      const noteId = eid('note-' + (idx + 1));
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
    const { lastFrame } = render(<Probe store={store} />);
    await new Promise(r => setTimeout(r, 50));
    store.dispatch({ type: 'ADD_NOTE_TAG', noteId: eid('note-3') as any, tagName: 'work' as any });
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('tags=work');
    expect(frame).toContain('n=4 first=note-1');
    expect(store.getState().data.notes.size).toBe(5);
  });

  it('4: WHEN src/tui/useAppState.ts is read THEN it contains export function useAppState, store.subscribe( and selectedIdRef', () => {
    const content = read('src/tui/useAppState.ts');
    expect(content).toContain('export function useAppState');
    expect(content).toContain('store.subscribe(');
    expect(content).toContain('selectedIdRef');
  });

  it('5: WHEN src/tui/App.tsx is read THEN it contains useAppState(store) and none of store.subscribe(, selectedIdRef, setNoteEntries, parseQuery', () => {
    const content = read('src/tui/App.tsx');
    expect(content).toContain('useAppState(store)');
    expect(content).not.toContain('store.subscribe(');
    expect(content).not.toContain('selectedIdRef');
    expect(content).not.toContain('setNoteEntries');
    expect(content).not.toContain('parseQuery');
  });

  it('6: WHEN the lines of src/tui/App.tsx are counted THEN there are fewer than 640', () => {
    const lines = read('src/tui/App.tsx').split('\n').length;
    expect(lines).toBeLessThan(640);
  });
});
