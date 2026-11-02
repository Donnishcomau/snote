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

const E = String.fromCharCode(27);
const BOLD = E + '[1m';
// #73: a focused heading is an accent bar: inverse, bold and blue, the label padded with spaces
const BAR = E + '[7m' + E + '[1m' + E + '[34m';
const FOCUSED = (label: string): string => BAR + label + ' ';
const UNFOCUSED = (label: string): string => E + '[1m' + E + '[34m' + label + E + '[39m' + E + '[22m';

// Focused pane headings on the heading line (inverse, bold, blue).
const focusedHeadings = (frame: string): string[] =>
  ['Tags', 'Notes', 'Preview'].filter((label) => (frame.split('\n')[0] ?? '').includes(BAR + label)).map((label) => BAR + label);

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

describe('One shared PaneHeading', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('1: WHEN <NoteList notes={[]} selectedIndex={0} width={40} height={10} focused /> is rendered THEN the frame holds the Notes accent bar (inverse, bold, blue, padded; #73); unfocused it has Notes bold and blue', async () => {
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
    expect(frame).toContain(UNFOCUSED('Notes'));
  });

  it('2: WHEN <TagPane tags={[\'home\']} selectedIndex={0} focused width={20} height={5} /> renders THEN the frame holds the Tags accent bar (#73); with focused={false} it has Tags bold and blue', async () => {
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
    expect(frame).toContain(UNFOCUSED('Tags'));
  });

  it('3: WHEN Preview renders a Groceries note THEN focused it holds the Preview: Groceries accent bar (#73), unfocused Preview: Groceries bold and blue, and never a bare bold Preview', async () => {
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
    expect(frame).toContain(UNFOCUSED('Preview: Groceries'));
    expect(frame).not.toContain(BOLD + 'Preview' + E + '[22m');
  });

  it('4: WHEN <History rows={[\'v2  2001-09-09 01:48  Pinned note\']} selectedIndex={0} loading={false} width={40} height={10} /> is rendered THEN the frame holds the History accent bar (#73)', async () => {
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
    expect(frame).toContain(FOCUSED('History'));
  });

  it('5: WHEN the App (2 notes, width 80) renders, then t, then Escape and Tab are written THEN exactly one heading matches the focused pattern each time: Notes, then Tags, then Preview', async () => {
    const store = seedTwoNotes();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />,
    );

    await delay(50);
    expect(focusedHeadings(lastFrame() ?? '')).toEqual([BAR + 'Notes']);

    stdin.write('t');
    await delay(50);
    expect(focusedHeadings(lastFrame() ?? '')).toEqual([BAR + 'Tags']);

    stdin.write(E);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    expect(focusedHeadings(lastFrame() ?? '')).toEqual([BAR + 'Preview']);
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
