import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;

function seedTags(store: ReturnType<typeof makeStore>) {
  const n1 = eid('n1');
  const n2 = eid('n2');
  const n3 = eid('n3');
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: n1,
    note: makeNote('n1' as never, 'Alpha', { tags: ['home'] }) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: n2,
    note: makeNote('n2' as never, 'Beta', { tags: ['work'] }) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: n3,
    note: makeNote('n3' as never, 'Gamma', { tags: ['zoo'] }) as never,
  });
}

function getTagRows(state: ReturnType<typeof makeStore>['getState']) {
  return Array.from(state().data.tags.keys());
}

describe('T77 Reorder tags from the tags pane (J down, K up)', () => {
  it('1: WHEN t, j, j, K are written (work up) THEN rows went from [home, work, zoo] to [work, home, zoo], one frame line starts with >work, and data.notes is the same Map as before K', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const beforeMap = store.getState().data.notes;
    expect(getTagRows(store.getState)).toEqual(['home', 'work', 'zoo']);

    // Open tags pane
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    // j moves to first tag (home), j moves to second tag (work)
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // K moves work up
    stdin.write('K');
    await new Promise(r => setTimeout(r, 50));

    expect(getTagRows(store.getState)).toEqual(['work', 'home', 'zoo']);

    const frame = lastFrame();
    expect(frame).toContain('>work');
    expect(store.getState().data.notes).toBe(beforeMap);

    unmount();
  });

  it('2: WHEN t, j, j, J are written (work down) THEN rows are [home, zoo, work] and one frame line starts with >work; after one more J (now the last tag) rows are still [home, zoo, work]', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Open tags pane
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // J moves work down
    stdin.write('J');
    await new Promise(r => setTimeout(r, 50));

    expect(getTagRows(store.getState)).toEqual(['home', 'zoo', 'work']);

    let frame = lastFrame();
    expect(frame).toContain('>work');

    // Now work is the last tag, another J should do nothing
    stdin.write('J');
    await new Promise(r => setTimeout(r, 50));

    expect(getTagRows(store.getState)).toEqual(['home', 'zoo', 'work']);

    unmount();
  });

  it('3: WHEN t, j, K are written (first tag home up) THEN data.tags is the same Map as before K and one frame line still starts with >home', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const tagsBefore = store.getState().data.tags;

    // Open tags pane
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    // j moves to first tag (home)
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // K tries to move home up (should do nothing)
    stdin.write('K');
    await new Promise(r => setTimeout(r, 50));

    expect(store.getState().data.tags).toBe(tagsBefore);

    const frame = lastFrame();
    expect(frame).toContain('>home');

    unmount();
  });

  it('4: WHEN t, j, j, j, J are written (last tag zoo down) THEN data.tags is the same Map as before J and one frame line still starts with >zoo', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const tagsBefore = store.getState().data.tags;

    // Open tags pane
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // J tries to move zoo down (should do nothing)
    stdin.write('J');
    await new Promise(r => setTimeout(r, 50));

    expect(store.getState().data.tags).toBe(tagsBefore);

    const frame = lastFrame();
    expect(frame).toContain('>zoo');

    unmount();
  });

  it('5: WHEN t, K, J are written (row All notes) and then j, j, j, j, J, K (row Untagged) THEN data.tags is the same Map as at start and one frame line starts with >Untagged', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const tagsBefore = store.getState().data.tags;

    // Open tags pane
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));

    // K on All notes (should do nothing)
    stdin.write('K');
    await new Promise(r => setTimeout(r, 50));
    // J on All notes (should do nothing)
    stdin.write('J');
    await new Promise(r => setTimeout(r, 50));

    // j, j, j, j to go to Untagged
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    // K, J on Untagged (should do nothing)
    stdin.write('K');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('J');
    await new Promise(r => setTimeout(r, 50));

    expect(store.getState().data.tags).toBe(tagsBefore);

    const frame = lastFrame();
    expect(frame).toContain('>Untagged');

    unmount();
  });

  it('6: WHEN J and then K are written while the note list has focus THEN data.tags is the same Map as at start and the frame equals the frame before J', async () => {
    const store = makeStore({ stubClient: {} });
    seedTags(store);

    const { stdin, lastFrame, unmount } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));

    const tagsBefore = store.getState().data.tags;
    const frameBefore = lastFrame();

    // J and K with note list focused (tags pane not open)
    stdin.write('J');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('K');
    await new Promise(r => setTimeout(r, 50));

    expect(store.getState().data.tags).toBe(tagsBefore);

    const frameAfter = lastFrame();
    expect(frameAfter).toEqual(frameBefore);

    unmount();
  });
});
