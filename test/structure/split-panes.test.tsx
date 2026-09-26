import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import type { Store } from 'redux';

import { makeStore } from '../../src/core/store';
import type { State } from '../../src/core/store';
import { MainPanes } from '../../src/tui/MainPanes';
import { makeNote } from '../tui/fixtures';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const a = { id: eid('a'), note: makeNote('a', 'Alpha note') };
const b = { id: eid('b'), note: makeNote('b', 'Beta note') };

type MainPanesProps = React.ComponentProps<typeof MainPanes>;

/** Fresh store plus base props; dispatch to the store BEFORE render. */
function setup(overrides?: Partial<MainPanesProps>): {
  store: Store<State>;
  props: MainPanesProps;
} {
  const store = makeStore({ stubClient: {} }) as Store<State>;
  const props = {
    store,
    view: {
      noteEntries: [a, b],
      selectedIndex: 1,
      tagNames: ['home', 'work'],
      query: '',
      collection: { type: 'all' },
    } as never,
    width: 80,
    height: 24,
    tagsOpen: false,
    tagsFocused: false,
    tagIndex: 0,
    rendered: false,
    searchOpen: false,
    selectedNote: b.note,
    historyOpen: false,
    historyIndex: 0,
    ...overrides,
  };
  return { store, props };
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('split-panes', () => {
  it("1: WHEN <MainPanes {...base} /> is rendered THEN the frame contains Notes, >Beta note and ' Alpha note', and none of History, Tags, search:, tag:, filter:", async () => {
    const { props } = setup();
    const { lastFrame } = render(<MainPanes {...props} />);
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Notes');
    expect(frame).toContain('>Beta note');
    expect(frame).toContain(' Alpha note');
    expect(frame).not.toContain('History');
    expect(frame).not.toContain('Tags');
    expect(frame).not.toContain('search:');
    expect(frame).not.toContain('tag:');
    expect(frame).not.toContain('filter:');
  });

  it("2: WHEN tagsOpen and tagsFocused are true and tagIndex is 1 THEN the frame contains Tags, All notes, >home, work, Untagged and still >Beta note", async () => {
    const { props } = setup({ tagsOpen: true, tagsFocused: true, tagIndex: 1 });
    const { lastFrame } = render(<MainPanes {...props} />);
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Tags');
    expect(frame).toContain('All notes');
    expect(frame).toContain('>home');
    expect(frame).toContain('work');
    expect(frame).toContain('Untagged');
    expect(frame).toContain('>Beta note');
  });

  it("3: WHEN view.query is 'bet' THEN the frame contains 'search: bet'; WHEN view.collection is { type: 'tag', tagName: 'work' } THEN it contains 'tag: work'; WHEN it is { type: 'untagged' } THEN 'filter: untagged'", async () => {
    const viewBase = {
      noteEntries: [a, b],
      selectedIndex: 1,
      tagNames: ['home', 'work'],
      query: '',
      collection: { type: 'all' },
    };

    const q = setup();
    q.props.view = { ...viewBase, query: 'bet' } as never;
    const r1 = render(<MainPanes {...q.props} />);
    await settle();
    expect(r1.lastFrame() ?? '').toContain('search: bet');
    r1.unmount();

    const t = setup();
    t.props.view = { ...viewBase, collection: { type: 'tag', tagName: 'work' } } as never;
    const r2 = render(<MainPanes {...t.props} />);
    await settle();
    expect(r2.lastFrame() ?? '').toContain('tag: work');
    r2.unmount();

    const u = setup();
    u.props.view = { ...viewBase, collection: { type: 'untagged' } } as never;
    const r3 = render(<MainPanes {...u.props} />);
    await settle();
    expect(r3.lastFrame() ?? '').toContain('filter: untagged');
    r3.unmount();
  });

  it("4: WHEN historyOpen is true and LOAD_REVISIONS for b brought version 1 'Old beta text' and 2 'Newer beta text' THEN the frame contains History, >v2, ' v1', 'Newer beta text', not 'Alpha note'; WHEN historyIndex is 1 THEN >v1 and 'Old beta text'", async () => {
    const revisions: [number, Note][] = [
      [1, makeNote('b', 'Old beta text')],
      [2, makeNote('b', 'Newer beta text')],
    ];

    const s1 = setup({ historyOpen: true });
    s1.store.dispatch({ type: 'LOAD_REVISIONS', noteId: b.id, revisions });
    const r1 = render(<MainPanes {...s1.props} />);
    await settle();
    const frame1 = r1.lastFrame() ?? '';
    expect(frame1).toContain('History');
    expect(frame1).toContain('>v2');
    expect(frame1).toContain(' v1');
    expect(frame1).toContain('Newer beta text');
    expect(frame1).not.toContain('Alpha note');
    r1.unmount();

    const s2 = setup({ historyOpen: true, historyIndex: 1 });
    s2.store.dispatch({ type: 'LOAD_REVISIONS', noteId: b.id, revisions });
    const r2 = render(<MainPanes {...s2.props} />);
    await settle();
    const frame2 = r2.lastFrame() ?? '';
    expect(frame2).toContain('>v1');
    expect(frame2).toContain('Old beta text');
    r2.unmount();
  });

  it("5: WHEN historyOpen is true and nothing was loaded THEN the frame contains History, 'loading...' and 'Beta note' (preview of the current note), and not '>Beta note'", async () => {
    const { props } = setup({ historyOpen: true });
    const { lastFrame } = render(<MainPanes {...props} />);
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('History');
    expect(frame).toContain('loading...');
    expect(frame).toContain('Beta note');
    expect(frame).not.toContain('>Beta note');
  });

  it("6: WHEN src/tui/App.tsx is read THEN it contains <MainPanes and <BottomArea exactly 1 time each, none of <NoteList, <History, <Preview, paneLayout(, revisionLabel, and has fewer than 395 lines", async () => {
    const appContent = read('src/tui/App.tsx');
    expect(appContent.match(/<MainPanes/g)?.length ?? 0).toBe(1);
    expect(appContent.match(/<BottomArea/g)?.length ?? 0).toBe(1);
    expect(appContent).not.toContain('<NoteList');
    expect(appContent).not.toContain('<History');
    expect(appContent).not.toContain('<Preview');
    expect(appContent).not.toContain('paneLayout(');
    expect(appContent).not.toContain('revisionLabel');
    expect(appContent.split('\n').length).toBeLessThan(395);
  });
});
