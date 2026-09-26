import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Confirm } from '../../src/tui/Prompt';
import { BottomArea } from '../../src/tui/BottomArea';
import { makeStore } from '../../src/core/store';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId, Note } from '@vendor/types';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)).default;

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

describe('destructive Confirm', () => {
  it('1: WHEN <Confirm question="delete tag work?" destructive onYes={...} onNo={...} /> is rendered with chalk forced to level 3 THEN the frame contains the exact \\u001b[1m\\u001b[31mdelete tag work? y/n\\u001b[39m\\u001b[22m', async () => {
    inkChalk.level = 3;
    const { lastFrame, unmount } = render(
      <Confirm question="delete tag work?" destructive onYes={vi.fn()} onNo={vi.fn()} />
    );
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('\u001b[1m\u001b[31mdelete tag work? y/n\u001b[39m\u001b[22m');
    unmount();
  });

  it('2: WHEN <Confirm question="rename tag work?" onYes={...} onNo={...} /> (no destructive prop) is rendered with chalk forced THEN the frame contains the plain rename tag work? y/n and does not contain \\u001b[31m', async () => {
    inkChalk.level = 3;
    const { lastFrame, unmount } = render(
      <Confirm question="rename tag work?" onYes={vi.fn()} onNo={vi.fn()} />
    );
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('rename tag work? y/n');
    expect(frame).not.toContain('\u001b[31m');
    unmount();
  });

  it('3: WHEN BottomArea is rendered with tagDialog={{ kind: "delete", tagName: "work" }} and chalk forced THEN the frame contains the exact \\u001b[1m\\u001b[31mdelete tag work? y/n\\u001b[39m\\u001b[22m', async () => {
    inkChalk.level = 3;
    const props = makeBaseProps();
    props.tagDialog = { kind: 'delete', tagName: 'work' };
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('\u001b[1m\u001b[31mdelete tag work? y/n\u001b[39m\u001b[22m');
    unmount();
  });

  it('4: WHEN BottomArea is rendered with logoutAsk={true} and chalk forced THEN the frame contains the exact \\u001b[1m\\u001b[31mlog out and delete local data? y/n\\u001b[39m\\u001b[22m', async () => {
    inkChalk.level = 3;
    const props = makeBaseProps();
    props.logoutAsk = true;
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('\u001b[1m\u001b[31mlog out and delete local data? y/n\u001b[39m\u001b[22m');
    unmount();
  });

  it('5: WHEN BottomArea is rendered with tagDialog={{ kind: "rename", tagName: "work" }} and chalk forced THEN the frame does not contain \\u001b[31m', async () => {
    inkChalk.level = 3;
    const props = makeBaseProps();
    props.tagDialog = { kind: 'rename', tagName: 'work' };
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).not.toContain('\u001b[31m');
    unmount();
  });
});
