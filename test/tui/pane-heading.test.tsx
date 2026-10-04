import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { readFileSync } from 'node:fs';

import { NoteList } from '../../src/tui/NoteList';
import { TagPane } from '../../src/tui/TagPane';
import { History } from '../../src/tui/History';
import { Preview } from '../../src/tui/Preview';
import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';
import { makeNote } from './fixtures';
import type { EntityId, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;

const BOLD = '\u001b[1m';
const FOCUSED = (label: string): string =>
  '\u001b[7m\u001b[1m' + label + '\u001b[22m\u001b[27m';

// Count focused pane headings in a frame (bold + inverse).
const focusedHeadings = (frame: string): string[] =>
  frame.match(/\u001b\[7m\u001b\[1m(Tags|Notes|Preview)/g) ?? [];

function seedTwoNotes(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('p1'),
    note: {
      content: 'Alpha note',
      creationDate: 1000,
      deleted: false,
      modificationDate: 1000,
      systemTags: [],
      tags: [tname('home')],
    },
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('p2'),
    note: {
      content: 'Beta note',
      creationDate: 2000,
      deleted: false,
      modificationDate: 2000,
      systemTags: [],
      tags: [],
    },
  });
  return store;
}

describe('T350 One shared PaneHeading', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('1: WHEN <NoteList notes={[]} selectedIndex={0} width={40} height={10} focused /> is rendered THEN the frame contains \\u001b[7m\\u001b[1mNotes\\u001b[22m\\u001b[27m; unfocused it has \\u001b[1mNotes\\u001b[22m', async () => {
    const { lastFrame, unmount } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} focused />,
    );
    await delay(50);
    const focusedFrame = lastFrame() ?? '';
    unmount();
    expect(focusedFrame).toContain(FOCUSED('Notes'));

    const { lastFrame: unfocused, unmount: unmount2 } = render(
      <NoteList notes={[]} selectedIndex={0} width={40} height={10} />,
    );
    await delay(50);
    const frame = unfocused() ?? '';
    unmount2();
    expect(frame).toContain(BOLD + 'Notes\u001b[22m');
  });

  it('2: WHEN <TagPane tags={[\'home\']} selectedIndex={0} focused width={20} height={5} /> renders THEN the frame has \\u001b[7m\\u001b[1mTags\\u001b[22m\\u001b[27m; with focused={false} it has \\u001b[1mTags\\u001b[22m', async () => {
    const { lastFrame, unmount } = render(
      <TagPane tags={['home']} selectedIndex={0} focused width={20} height={5} />,
    );
    await delay(50);
    const focusedFrame = lastFrame() ?? '';
    unmount();
    expect(focusedFrame).toContain(FOCUSED('Tags'));

    const { lastFrame: unfocused, unmount: unmount2 } = render(
      <TagPane tags={['home']} selectedIndex={0} focused={false} width={20} height={5} />,
    );
    await delay(50);
    const frame = unfocused() ?? '';
    unmount2();
    expect(frame).toContain(BOLD + 'Tags\u001b[22m');
  });

  it('3: WHEN Preview renders a Groceries note THEN focused it has \\u001b[7m\\u001b[1mPreview: Groceries\\u001b[22m\\u001b[27m, unfocused \\u001b[1mPreview: Groceries\\u001b[22m, no note \\u001b[1mPreview\\u001b[22m', async () => {
    const note = makeNote('g', 'Groceries\n\nbody', {});
    const { lastFrame, unmount } = render(
      <Preview note={note} width={80} height={24} focused />,
    );
    await delay(50);
    const focusedFrame = lastFrame() ?? '';
    unmount();
    expect(focusedFrame).toContain(FOCUSED('Preview: Groceries'));

    const { lastFrame: unfocused, unmount: unmount2 } = render(
      <Preview note={note} width={80} height={24} />,
    );
    await delay(50);
    const frame = unfocused() ?? '';
    unmount2();
    expect(frame).toContain(BOLD + 'Preview: Groceries\u001b[22m');
    expect(frame).not.toContain(BOLD + 'Preview\u001b[22m');
  });

  it('4: WHEN <History rows={[\'v2  2001-09-09 01:48  Pinned note\']} selectedIndex={0} loading={false} width={40} height={10} /> is rendered THEN the frame contains \\u001b[7m\\u001b[1mHistory\\u001b[22m\\u001b[27m', async () => {
    const { lastFrame } = render(
      <History
        rows={['v2  2001-09-09 01:48  Pinned note']}
        selectedIndex={0}
        loading={false}
        width={40}
        height={10}
      />,
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[7m\u001b[1mHistory\u001b[22m\u001b[27m');
  });

  it('5: WHEN the App (2 notes, width 80) renders, then t, then Escape and Tab are written THEN exactly one heading matches the focused pattern each time: Notes, then Tags, then Preview', async () => {
    const store = seedTwoNotes();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />,
    );

    await delay(50);
    expect(focusedHeadings(lastFrame() ?? '')).toEqual(['\u001b[7m\u001b[1mNotes']);

    stdin.write('t');
    await delay(50);
    expect(focusedHeadings(lastFrame() ?? '')).toEqual(['\u001b[7m\u001b[1mTags']);

    stdin.write('\u001b');
    await delay(50);
    stdin.write('\t');
    await delay(50);
    expect(focusedHeadings(lastFrame() ?? '')).toEqual(['\u001b[7m\u001b[1mPreview']);
  });

  it('6: WHEN the sources are read THEN <PaneHeading occurs 1 time in TagPane.tsx, NoteList.tsx, History.tsx and 2 times in Preview.tsx, and none has <Text>Tags</Text>, <Text>Notes</Text>, <Text>Preview</Text>', async () => {
    const read = (name: string): string =>
      readFileSync(path.join(process.cwd(), 'src', 'tui', name), 'utf-8');

    const counts: [string, number][] = [
      ['TagPane.tsx', 1],
      ['NoteList.tsx', 1],
      ['History.tsx', 1],
      ['Preview.tsx', 2],
    ];
    for (const [name, expected] of counts) {
      const source = read(name);
      expect((source.match(/<PaneHeading/g) ?? []).length).toBe(expected);
    }

    for (const name of ['TagPane.tsx', 'NoteList.tsx', 'History.tsx', 'Preview.tsx']) {
      const source = read(name);
      expect(source).not.toContain('<Text>Tags</Text>');
      expect(source).not.toContain('<Text>Notes</Text>');
      expect(source).not.toContain('<Text>Preview</Text>');
    }
  });
});
