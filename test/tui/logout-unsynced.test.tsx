import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useState } from 'react';

import { BottomArea } from '../../src/tui/BottomArea';
import { makeStore } from '../../src/core/store';
import { pendingCount, initialState } from '../../src/core/simperium-reducer';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const noteA: Note = {
  content: 'Alpha note',
  creationDate: Date.now(),
  deleted: false,
  modificationDate: Date.now(),
  systemTags: [],
  tags: [],
} as Note;

const noteEntries: { id: EntityId; note: Note }[] = [
  { id: eid('note-a'), note: noteA },
];

const makeView = (overrides?: Record<string, unknown>) => ({
  allTagNames: [] as string[],
  connected: false,
  noteEntries,
  inTrash: false,
  sortLabelStr: 'sort: modified',
  pending: 0,
  selectedIndex: 0,
  setSelectedIndex: vi.fn(),
  query: '',
  setQuery: vi.fn(),
  tagNames: [] as string[],
  collection: { type: 'all' },
  ...overrides,
} as never);

/** A "tracking store": stub client but tracking switched on. */
function trackingStore(): ReturnType<typeof makeStore> {
  return makeStore({
    stubClient: {},
    preloadedState: { simperium: { ...initialState, tracking: true } } as never,
  });
}

/** Wrapper that lifts logoutAsk into local state so the parent-child pattern works. */
function BottomAreaWrapper({
  store,
  onLogout,
  logoutAsk: initialLogoutAsk,
}: {
  store: Store<State>;
  onLogout: () => void;
  logoutAsk: boolean;
}) {
  const [logoutAsk, setLogoutAsk] = useState(initialLogoutAsk);
  return (
    <BottomArea
      store={store}
      view={makeView()}
      selectedEntry={noteEntries[0]}
      width={80}
      onLogout={onLogout}
      tagEditorOpen={false}
      setTagEditorOpen={vi.fn()}
      tagDialog={null}
      setTagDialog={vi.fn()}
      logoutAsk={logoutAsk}
      setLogoutAsk={setLogoutAsk}
      emptyAsk={0}
      setEmptyAsk={vi.fn()}
      copyResult={null}
      tagsFocused={false}
      searchOpen={false}
    />
  );
}

describe('logout unsynced warning (T274)', () => {
  it('1: WHEN BottomArea is rendered with logoutAsk true and a store whose pendingCount is 0 THEN the frame contains "log out and delete local data? y/n" and does not contain "type \'logout\'"', async () => {
    const store = makeStore({ stubClient: {} });
    expect(pendingCount(store.getState().simperium)).toBe(0);
    const onLogout = vi.fn();
    const { lastFrame, unmount } = render(
      <BottomArea
        store={store as Store<State>}
        view={makeView()}
        selectedEntry={noteEntries[0]}
        width={80}
        onLogout={onLogout}
        tagEditorOpen={false}
        setTagEditorOpen={vi.fn()}
        tagDialog={null}
        setTagDialog={vi.fn()}
        logoutAsk={true}
        setLogoutAsk={vi.fn()}
        emptyAsk={0}
        setEmptyAsk={vi.fn()}
        copyResult={null}
        tagsFocused={false}
        searchOpen={false}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('log out and delete local data? y/n');
    expect(frame).not.toContain("type 'logout'");
    unmount();
  });

  it('2: WHEN BottomArea is rendered with logoutAsk true and a store with 1 edited note (pendingCount 1) THEN the frame contains "log out: 1 unsynced notes will be lost - type \'logout\' to confirm" and does not contain "y/n"', async () => {
    const store = trackingStore();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('unsynced-1'),
      note: { content: 'unsynced content', systemTags: [], tags: [], deleted: false, creationDate: Date.now(), modificationDate: Date.now() },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('unsynced-1'),
      changes: { content: 'edited content' },
    });
    expect(pendingCount(store.getState().simperium)).toBe(1);
    const onLogout = vi.fn();
    const { lastFrame, unmount } = render(
      <BottomArea
        store={store as Store<State>}
        view={makeView()}
        selectedEntry={noteEntries[0]}
        width={80}
        onLogout={onLogout}
        tagEditorOpen={false}
        setTagEditorOpen={vi.fn()}
        tagDialog={null}
        setTagDialog={vi.fn()}
        logoutAsk={true}
        setLogoutAsk={vi.fn()}
        emptyAsk={0}
        setEmptyAsk={vi.fn()}
        copyResult={null}
        tagsFocused={false}
        searchOpen={false}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain("log out: 1 unsynced notes will be lost - type 'logout' to confirm");
    expect(frame).not.toContain('y/n');
    unmount();
  });

  it('3: WHEN line 2\'s prompt is shown and y then Enter is written THEN the logout callback was called 0 times and the prompt is closed', async () => {
    const store = trackingStore();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('unsynced-1'),
      note: { content: 'unsynced content', systemTags: [], tags: [], deleted: false, creationDate: Date.now(), modificationDate: Date.now() },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('unsynced-1'),
      changes: { content: 'edited content' },
    });
    const onLogout = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <BottomAreaWrapper store={store as Store<State>} onLogout={onLogout} logoutAsk={true} />
    );
    await new Promise(r => setTimeout(r, 50));

    // y then Enter — y is not 'logout' so it just appends; then Enter submits 'y' which != 'logout', so onCancel fires
    stdin.write('y');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));

    expect(onLogout).toHaveBeenCalledTimes(0);
    const frame = lastFrame();
    expect(frame).not.toContain('unsynced');
    unmount();
  });

  it('4: WHEN line 2\'s prompt is shown and logout then Enter is written THEN the logout callback was called exactly 1 time', async () => {
    const store = trackingStore();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('unsynced-1'),
      note: { content: 'unsynced content', systemTags: [], tags: [], deleted: false, creationDate: Date.now(), modificationDate: Date.now() },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('unsynced-1'),
      changes: { content: 'edited content' },
    });
    const onLogout = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <BottomAreaWrapper store={store as Store<State>} onLogout={onLogout} logoutAsk={true} />
    );
    await new Promise(r => setTimeout(r, 50));

    // type 'logout' then Enter → onSubmit fires → handleLogoutYes() → onLogout()
    stdin.write('l');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('o');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('g');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('o');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('u');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));

    expect(onLogout).toHaveBeenCalledTimes(1);
    const frame = lastFrame();
    expect(frame).not.toContain('unsynced');
    unmount();
  });

  it('5: WHEN line 2\'s prompt is shown and Escape is written THEN the logout callback was called 0 times and the frame no longer contains "unsynced"', async () => {
    const store = trackingStore();
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('unsynced-1'),
      note: { content: 'unsynced content', systemTags: [], tags: [], deleted: false, creationDate: Date.now(), modificationDate: Date.now() },
    });
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('unsynced-1'),
      changes: { content: 'edited content' },
    });
    const onLogout = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <BottomAreaWrapper store={store as Store<State>} onLogout={onLogout} logoutAsk={true} />
    );
    await new Promise(r => setTimeout(r, 50));

    // Escape → onCancel → setLogoutAsk(false)
    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    expect(onLogout).toHaveBeenCalledTimes(0);
    const frame = lastFrame();
    expect(frame).not.toContain('unsynced');
    unmount();
  });
});
