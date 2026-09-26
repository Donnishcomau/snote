/**
 * T198: crash fix — a tag without a name never crashes the tags pane
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { tagRows } from '../../src/core/collection';
import { TagPane } from '../../src/tui/TagPane';
import { makeStore } from '../../src/core/store';
import type { TagHash, Tag, TagName } from '@vendor/types';

// ---------- helpers ----------

function getLines(frame: string | undefined) {
  return (frame ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

const mixedTags: Map<TagHash, Tag> = new Map([
  ['home' as TagHash, { name: 'home' }],
  ['bad1' as TagHash, {}],
  ['bad2' as TagHash, { name: '', index: 0 }],
  ['bad3' as TagHash, undefined as never],
  ['work' as TagHash, { name: 'work', index: 1 }],
]) as never;

// ---------- 1: tagRows(mixed) returns ['work','home'], Map untouched ----------

describe('T198 tagRows skips nameless entries', () => {
  it('1: WHEN tagRows(mixed) is called THEN it returns exactly [work, home] and mixed.size is still 5', () => {
    const sizeBefore = mixedTags.size;
    const result = tagRows(mixedTags);
    expect(result).toEqual(['work', 'home']);
    expect(mixedTags.size).toBe(sizeBefore);
  });

  // ---------- 2: only-bad / empty Map ----------

  it('2: WHEN the Map holds only the three bad entries bad1, bad2, bad3 THEN tagRows returns []; WHEN the Map is empty THEN it returns []', () => {
    const badOnly = new Map<TagHash, Tag>([
      ['bad1' as TagHash, {} as Tag],
      ['bad2' as TagHash, { name: '', index: 0 } as Tag],
      ['bad3' as TagHash, undefined as never],
    ]) as never;
    expect(tagRows(badOnly)).toEqual([]);
    expect(tagRows(new Map<TagHash, Tag>())).toEqual([]);
  });

  // ---------- 3: TagPane with undefined in tags prop ----------

  it('3: WHEN <TagPane tags={[home, undefined, work] as never} selectedIndex={1} focused={true} width={20} height={10} /> is rendered THEN getLines equal [Tags, All notes, >home, work, Untagged] and the render did not throw', async () => {
    const { lastFrame, unmount } = render(
      <TagPane tags={['home', undefined, 'work'] as never} selectedIndex={1} focused={true} width={20} height={10} />
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = getLines(lastFrame());
    expect(lines).toEqual(['Tags', '·All notes', '>home', ' work', '·Untagged']);
    unmount();
  });

  // ---------- 4: full App render after TAG_BUCKET_UPDATE ----------

  it('4: WHEN a store gets { type: TAG_BUCKET_UPDATE, tagHash: ghost1, tag: {} } after a note with the tag home, and <App store={store} width={120} height={40} /> is rendered THEN the frame contains All notes, home and Untagged, and does not contain undefined', async () => {
    const { App } = await import('../../src/tui/App');
    const store = makeStore({ stubClient: {} });

    // seed a note with a tag
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n1' as never,
      note: {
        content: 'test',
        tags: ['home'],
        systemTags: [],
        deleted: false,
      } as never,
    });

    // dispatch the valid home tag and the nameless-tag action
    store.dispatch({
      type: 'TAG_BUCKET_UPDATE',
      tagHash: 'home' as TagHash,
      tag: { name: 'home' } as never,
      isIndexing: false,
    } as never);
    store.dispatch({
      type: 'TAG_BUCKET_UPDATE',
      tagHash: 'ghost1' as TagHash,
      tag: {} as Tag,
      isIndexing: false,
    } as never);

    const { lastFrame, unmount } = render(
      <App store={store} width={120} height={40} />
    );
    await new Promise((r) => setTimeout(r, 200));

    const frame = lastFrame() ?? '';

    expect(frame).toContain('All notes');
    expect(frame).toContain('home');
    expect(frame).toContain('Untagged');
    expect(frame).not.toContain('undefined');

    unmount();
  });
});
