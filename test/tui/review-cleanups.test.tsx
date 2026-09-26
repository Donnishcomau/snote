import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';

import { makeStore } from '../../src/core/store';
import { useAppState } from '../../src/tui/useAppState';
import { sortEntries } from '../../src/tui/app-model';
import { splitPastedInput } from '../../src/tui/split-input';
import { testNotes } from '../tui/fixtures';
import type { EntityId } from '@vendor/types';

vi.mock('../../src/tui/app-model', async (orig) => {
  const mod = (await orig()) as typeof import('../../src/tui/app-model');
  return { ...mod, sortEntries: vi.fn(mod.sortEntries) };
});

const sortMock = vi.mocked(sortEntries);

const eid = (id: string): EntityId => id as unknown as EntityId;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// Same Probe component as test/structure/split-state.test.tsx:17-24.
function Probe({ store }: { store: ReturnType<typeof makeStore> }) {
  const v = useAppState(store);
  return (
    <Text>
      {'n=' + v.noteEntries.length + ' first=' + (v.noteEntries[0]?.id ?? '-') + ' q=' + v.query + ' tags=' + v.tagNames.join(',') + ' sel=' + v.selectedIndex}
    </Text>
  );
}

const seedNotes = (store: ReturnType<typeof makeStore>) => {
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
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('review-cleanups', () => {
  it('1: WHEN a Probe mounts with the 5-note testNotes fixture THEN the mocked sortEntries has been called at least 1 time', async () => {
    const store = makeStore({ stubClient: {} });
    seedNotes(store);
    render(<Probe store={store} />);
    await delay(50);
    expect(sortMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("2: WHEN { type: 'SEARCH', searchQuery: 'pinned' } is dispatched twice THEN sortEntries's call count is unchanged and the frame contains n=1", async () => {
    const store = makeStore({ stubClient: {} });
    seedNotes(store);
    const { lastFrame } = render(<Probe store={store} />);
    await delay(50);
    const before = sortMock.mock.calls.length;
    store.dispatch({ type: 'SEARCH', searchQuery: 'pinned' });
    await delay(50);
    store.dispatch({ type: 'SEARCH', searchQuery: 'pinned' });
    await delay(50);
    expect(sortMock.mock.calls.length).toBe(before);
    expect(lastFrame()).toContain('n=1');
  });

  it("3: WHEN { type: 'setSortType', sortType: 'alphabetical' } is dispatched THEN sortEntries's call count is at least 1 higher", async () => {
    const store = makeStore({ stubClient: {} });
    seedNotes(store);
    render(<Probe store={store} />);
    await delay(50);
    store.dispatch({ type: 'SEARCH', searchQuery: 'pinned' });
    await delay(50);
    const before = sortMock.mock.calls.length;
    store.dispatch({ type: 'setSortType', sortType: 'alphabetical' });
    await delay(50);
    expect(sortMock.mock.calls.length).toBeGreaterThanOrEqual(before + 1);
  });

  it("4: WHEN splitPastedInput('br1\\r') is called THEN it returns ['b', 'r', '1', '\\r']", () => {
    expect(splitPastedInput('br1\r')).toEqual(['b', 'r', '1', '\r']);
  });

  it("5: WHEN splitPastedInput('a') and splitPastedInput('br\\x1b1') are called THEN both return null", () => {
    expect(splitPastedInput('a')).toBeNull();
    expect(splitPastedInput('br\x1b1')).toBeNull();
  });

  it('6: WHEN package.json is read THEN it has no marked/marked-terminal deps and ws ^8.18.0 under devDependencies only', () => {
    const content = read('package.json');
    expect(content).not.toContain('"marked"');
    expect(content).not.toContain('"marked-terminal"');
    const pkg = JSON.parse(content);
    expect(pkg.devDependencies['ws']).toBe('^8.18.0');
    expect(pkg.dependencies).not.toHaveProperty('ws');
  });
});
