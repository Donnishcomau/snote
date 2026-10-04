import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { BottomArea } from '../../src/tui/BottomArea';
import { makeStore } from '../../src/core/store';
import { LIST_HINTS, TAGS_HINTS, TRASH_HINTS, hintsForContext, visibleHints } from '../../src/tui/KeyHints';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId, Note } from '@vendor/types';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)).default;

async function resetChalkLevel0(): Promise<void> {
  const { createRequire: cr } = await import('module');
  const pathPkg = await import('path');
  const { pathToFileURL: pfu } = await import('url');
  const inkResolved = cr(import.meta.url).resolve('ink');
  const inkDir = pathPkg.dirname(pathPkg.dirname(inkResolved));
  const chalkModule = await import(pfu(pathPkg.join(inkDir, 'node_modules/chalk/source/index.js')).href);
  (chalkModule.default as any).level = 0;
}

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

const makeBaseProps = () => ({
  store: makeStore({ stubClient: {} }) as Store<State>,
  view: makeView(),
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
});

describe('KeyHints (T264)', () => {
  it('1: WHEN <BottomArea {...makeBaseProps()} /> (from the reused makeBaseProps(), selectedEntry: null) is rendered with chalk forced to level 3 THEN the frame contains the exact \\u001b[34m?\\u001b[39m Help; rendered again WITHOUT forcing chalk, the frame contains the exact ? Help  n New  e Edit  g Add tag  / Search  q Quit', async () => {
    inkChalk.level = 3;
    const { lastFrame, unmount } = render(<BottomArea {...makeBaseProps()} />);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('\u001b[34m?\u001b[39m Help');
    unmount();

    // Reset chalk level for the no-chalk test
    await resetChalkLevel0();

    const { lastFrame: lastFrame2, unmount: unmount2 } = render(<BottomArea {...makeBaseProps()} />);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame2()).toContain('? Help  n New  e Edit  g Add tag  / Search  q Quit');
    unmount2();
  });

  it('2: WHEN <BottomArea {...makeBaseProps()} tagsFocused={true} /> is rendered THEN the frame contains the exact j/k Move  Enter Select  R Rename  x Delete  Escape Back and does not contain ? Help', async () => {
    await resetChalkLevel0();
    const { lastFrame, unmount } = render(<BottomArea {...makeBaseProps()} tagsFocused={true} />);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('j/k Move  Enter Select  R Rename  x Delete  Escape Back');
    expect(lastFrame()).not.toContain('? Help');
    unmount();
  });

  it('3: WHEN <BottomArea {...makeBaseProps()} view={makeView({ inTrash: true })} /> is rendered THEN the frame contains the exact u Restore  D Delete  E Empty  T Back and does not contain ? Help', async () => {
    await resetChalkLevel0();
    const props = makeBaseProps();
    props.view = makeView({ inTrash: true });
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('u Restore  D Delete  E Empty  T Back');
    expect(lastFrame()).not.toContain('? Help');
    unmount();
  });

  it('4: WHEN visibleHints(LIST_HINTS, 80), visibleHints(LIST_HINTS, 120) and visibleHints(LIST_HINTS, 312) are each called THEN each call returns all 7 entries, unchanged and in the same order as LIST_HINTS', () => {
    expect(visibleHints(LIST_HINTS, 80).length).toBe(7);
    expect(visibleHints(LIST_HINTS, 80)).toEqual(LIST_HINTS);
    expect(visibleHints(LIST_HINTS, 120).length).toBe(7);
    expect(visibleHints(LIST_HINTS, 120)).toEqual(LIST_HINTS);
    expect(visibleHints(LIST_HINTS, 312).length).toBe(7);
    expect(visibleHints(LIST_HINTS, 312)).toEqual(LIST_HINTS);
  });

  it('5: WHEN visibleHints(LIST_HINTS, 30) is called THEN it returns exactly [{key:\'?\',label:\'Help\'},{key:\'n\',label:\'New\'},{key:\'e\',label:\'Edit\'}, dropping g/Add tag, / Search and q Quit from the end', () => {
    const result = visibleHints(LIST_HINTS, 30);
    expect(result).toEqual([
      { key: '?', label: 'Help' },
      { key: 'n', label: 'New' },
      { key: 'e', label: 'Edit' },
    ]);
  });

  it('6: WHEN <BottomArea {...makeBaseProps()} view={makeView({ connected: true })} /> is rendered THEN the frame contains both ? Help and the unchanged status text [connected] and 1 notes', async () => {
    await resetChalkLevel0();
    const props = makeBaseProps();
    props.view = makeView({ connected: true });
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('? Help');
    expect(frame).toContain('[connected]');
    expect(frame).toContain('1 notes');
    unmount();
  });
});

describe('hintsForContext pure', () => {
  it('hintsForContext(list) returns LIST_HINTS; tags returns TAGS_HINTS; trash returns TRASH_HINTS', () => {
    expect(hintsForContext('list')).toBe(LIST_HINTS);
    expect(hintsForContext('tags')).toBe(TAGS_HINTS);
    expect(hintsForContext('trash')).toBe(TRASH_HINTS);
  });
});
