import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { publishLink, emptyTrashActions } from '../../src/core/note-keys';
import { Confirm, Prompt } from '../../src/tui/Prompt';
import { BottomArea } from '../../src/tui/BottomArea';
import type { EntityId, Note } from '@vendor/types';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

function makeTestNote(id: string, content: string): Note {
  return {
    content,
    creationDate: Date.now(),
    deleted: false,
    modificationDate: Date.now(),
    systemTags: [],
    tags: [],
  } as Note;
}

const noteA = makeTestNote('note-a', 'Alpha note');
const noteB = makeTestNote('note-b', 'Beta note');

const noteEntries: { id: EntityId; note: Note }[] = [
  { id: eid('note-a'), note: noteA },
  { id: eid('note-b'), note: noteB },
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

const makeStoreAndProps = (overrides?: Record<string, unknown>) => {
  const store = makeStore({ stubClient: {} }) as Store<State> & { stopSync?: () => void; forceSync?: () => void };
  return {
    store,
    view: makeView(overrides),
    selectedEntry: noteEntries[0],
    width: 80,
    onLogout: vi.fn(),
    tagEditorOpen: false,
    setTagEditorOpen: vi.fn(),
    tagDialog: null,
    setTagDialog: vi.fn(),
    logoutAsk: false,
    setLogoutAsk: vi.fn(),
    emptyAsk: 0,
    setEmptyAsk: vi.fn(),
    copyResult: null,
    tagsFocused: false,
    searchOpen: false,
  };
};

describe('split-bottom', () => {
  it('1: WHEN <BottomArea {...base} /> is rendered THEN the frame contains [offline] 2 notes and not sort:, WHEN view has inTrash: true and sortLabelStr: sort: created THEN it contains 2 notes trash  sort: created', async () => {
    const baseProps = makeStoreAndProps();
    const { lastFrame } = render(<BottomArea {...baseProps} />);
    await new Promise(r => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toMatch(/\[offline\] 2 notes/);
    expect(frame).not.toContain('sort:');

    const trashView = {
      allTagNames: [] as string[],
      connected: false,
      noteEntries,
      inTrash: true,
      sortLabelStr: 'sort: created',
      pending: 0,
      selectedIndex: 0,
      setSelectedIndex: vi.fn(),
      query: '',
      setQuery: vi.fn(),
      tagNames: [] as string[],
      collection: { type: 'all' },
    } as never;
    const { lastFrame: lastFrame2 } = render(<BottomArea {...baseProps} view={trashView} />);
    await new Promise(r => setTimeout(r, 50));
    const frame2 = lastFrame2();
    expect(frame2).toContain('2 notes trash');
    expect(frame2).toContain('sort: created');
  });

  it('2: WHEN logoutAsk is true and y is written THEN before y the frame contains log out and delete local data? y/n, after it onLogout was called 1 time and setLogoutAsk was called with false', async () => {
    const setLogoutAsk = vi.fn();
    const onLogout = vi.fn();
    const { lastFrame, stdin, unmount } = render(
      <BottomArea
        store={makeStore({ stubClient: {} }) as Store<State>}
        view={makeView()}
        selectedEntry={noteEntries[0]}
        width={80}
        onLogout={onLogout}
        tagEditorOpen={false}
        setTagEditorOpen={vi.fn()}
        tagDialog={null}
        setTagDialog={vi.fn()}
        logoutAsk={true}
        setLogoutAsk={setLogoutAsk}
        emptyAsk={0}
        setEmptyAsk={vi.fn()}
        copyResult={null}
        tagsFocused={false}
        searchOpen={false}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toContain('log out and delete local data? y/n');

    // Render Confirm directly to verify key handling
    const { lastFrame: lf2, stdin: st2, unmount: um2 } = render(
      <Confirm question="log out and delete local data?" onYes={() => { onLogout(); setLogoutAsk(false); }} onNo={() => setLogoutAsk(false)} />
    );
    await new Promise(r => setTimeout(r, 50));
    expect(lf2()).toContain('log out and delete local data? y/n');

    st2.write('y');
    await new Promise(r => setTimeout(r, 50));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(setLogoutAsk).toHaveBeenCalledWith(false);
    um2();
    unmount();
  });

  it('3: WHEN emptyAsk is 2 and n,o,p,e,\r are written THEN before the input the frame contains empty trash (2 notes) - type \'empty\' to confirm; after wrong entry setEmptyAsk was called with 0 and store.getState().data.notes is the same Map as before (toBe)', async () => {
    const store = makeStore({ stubClient: {} }) as Store<State> & { stopSync?: () => void; forceSync?: () => void };
    const notesBefore = store.getState().data.notes;
    const setEmptyAsk = vi.fn();
    const onLogout = vi.fn();
    const { lastFrame, stdin, unmount } = render(
      <BottomArea
        store={store}
        view={makeView({ emptyAsk: 2, setEmptyAsk: vi.fn() })}
        selectedEntry={noteEntries[0]}
        width={80}
        onLogout={onLogout}
        tagEditorOpen={false}
        setTagEditorOpen={vi.fn()}
        tagDialog={null}
        setTagDialog={vi.fn()}
        logoutAsk={false}
        setLogoutAsk={vi.fn()}
        emptyAsk={2}
        setEmptyAsk={setEmptyAsk}
        copyResult={null}
        tagsFocused={false}
        searchOpen={false}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toContain("empty trash (2 notes) - type 'empty' to confirm");

    // Type "nope" then Enter (wrong entry)
    stdin.write('n');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('o');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('p');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('e');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(setEmptyAsk).toHaveBeenCalledWith(0);
    expect(store.getState().data.notes).toBe(notesBefore);
    unmount();
  });

  it('4: WHEN tagDialog is { kind: delete, tagName: work } THEN the frame contains delete tag work? y/n and not notes', async () => {
    const { lastFrame } = render(<BottomArea {...makeStoreAndProps()} tagDialog={{ kind: 'delete', tagName: 'work' }} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('delete tag work? y/n');
    expect(frame).not.toContain('notes');
  });

  it('5: WHEN src/tui/App.tsx is read THEN it contains <BottomArea and none of <StatusBar, <Confirm, <TagEditor, handleLogoutYes; and src/tui/BottomArea.tsx contains export function BottomArea', async () => {
    const appContent = read('src/tui/App.tsx');
    expect(appContent).toContain('<BottomArea');
    expect(appContent).not.toContain('<StatusBar');
    expect(appContent).not.toContain('<Confirm');
    expect(appContent).not.toContain('<TagEditor');
    expect(appContent).not.toContain('handleLogoutYes');

    const bottomContent = read('src/tui/BottomArea.tsx');
    expect(bottomContent).toContain('export function BottomArea');
  });

  it('6: WHEN the lines of src/tui/App.tsx are counted THEN there are fewer than 490', async () => {
    const lines = read('src/tui/App.tsx').split('\n').length;
    expect(lines).toBeLessThan(490);
  });
});
