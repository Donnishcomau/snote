// T349: the list footer mentions Tab and the tags pane. The default footer
// gets one more entry, `Tab Tags`, as the last of LIST_HINTS.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { App } from '../../src/tui/App';
import { LIST_HINTS, TAGS_HINTS, TRASH_HINTS, visibleHints } from '../../src/tui/KeyHints';
import KeyHints from '../../src/tui/KeyHints';
import { makeStore } from '../../src/core/store';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

function seedNotesAndTags(store: ReturnType<typeof makeStore>) {
  // Same seeding as tags-pane.test.tsx:16-27: five fixture notes, then
  // ADD_NOTE_TAG creates the tag entries (work on note-3, home on note-4).
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

describe('Footer Tab hint (T349)', () => {
  it('1: WHEN <KeyHints context="list" width={80} /> is rendered THEN the stripped frame contains ? Help  n New  e Edit  g Add tag  / Search  q Quit  Tab Tags', async () => {
    const { lastFrame, unmount } = render(<KeyHints context="list" width={80} />);
    await delay(50);
    const frame = lastFrame() ?? '';
    expect(stripAnsi(frame)).toContain('? Help  n New  e Edit  g Add tag  / Search  q Quit  Tab Tags');
    unmount();
  });

  it('2: WHEN LIST_HINTS is read THEN it has 7 entries, the last equals { key: \'Tab\', label: \'Tags\' }, and TAGS_HINTS and TRASH_HINTS have no entry whose key is Tab', () => {
    expect(LIST_HINTS.length).toBe(7);
    expect(LIST_HINTS[LIST_HINTS.length - 1]).toEqual({ key: 'Tab', label: 'Tags' });
    expect(TAGS_HINTS.some((h) => h.key === 'Tab')).toBe(false);
    expect(TRASH_HINTS.some((h) => h.key === 'Tab')).toBe(false);
  });

  it('3: WHEN visibleHints(LIST_HINTS, 60) and visibleHints(LIST_HINTS, 59) are called THEN they return 7 and 6 entries, and the 6 do not include the Tab entry', () => {
    expect(visibleHints(LIST_HINTS, 60).length).toBe(7);
    const six = visibleHints(LIST_HINTS, 59);
    expect(six.length).toBe(6);
    expect(six.some((h) => h.key === 'Tab')).toBe(false);
  });

  it('4: WHEN the App is rendered at width 80 THEN the frame contains Tab Tags; after t (tags pane focused) it contains j/k Move and does not contain Tab Tags', async () => {
    const store = makeStore({ stubClient: {} });
    const { lastFrame, stdin, unmount } = render(
      <App store={store} width={80} height={24} />,
    );
    await delay(50);
    expect(stripAnsi(lastFrame() ?? '')).toContain('Tab Tags');
    stdin.write('t');
    await delay(0);
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('j/k Move');
    expect(frame).not.toContain('Tab Tags');
    unmount();
  });

  it('5: WHEN the App is rendered at width 100 (tags open by themselves, tags seeded as in test/tui/tags-pane.test.tsx:16-27) THEN the frame contains Tab Tags', async () => {
    const store = makeStore({ stubClient: {} });
    seedNotesAndTags(store);
    const { lastFrame, unmount } = render(
      <App store={store} width={100} height={24} />,
    );
    await delay(50);
    expect(stripAnsi(lastFrame() ?? '')).toContain('Tab Tags');
    unmount();
  });
});
