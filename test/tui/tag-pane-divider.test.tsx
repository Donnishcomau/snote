import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { TagPane } from '../../src/tui/TagPane';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getLines(frame: string | undefined) {
  return (frame ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

describe('T192 TagPane divider', () => {
  it('1: WHEN TagPane tags={[home]} selectedIndex={1} focused width={20} height={5} divider THEN the 5 frame lines are exact', async () => {
    const { lastFrame, unmount } = render(
      <TagPane tags={['home']} selectedIndex={1} focused={true} width={20} height={5} divider />
    );

    await delay(50);

    const lines = getLines(lastFrame());

    expect(lines).toEqual([
      'Tags               │',
      '·All notes         │',
      '>home              │',
      '·Untagged          │',
      '                   │',
    ]);

    unmount();
  });

  it('2: WHEN the same is rendered without divider THEN no frame line contains │ and the trimmed non-empty lines equal [Tags, All notes, >home, Untagged]', async () => {
    const { lastFrame, unmount } = render(
      <TagPane tags={['home']} selectedIndex={1} focused={true} width={20} height={5} />
    );

    await delay(50);

    const frame = lastFrame() ?? '';

    expect(frame).not.toContain('│');

    const lines = getLines(lastFrame());

    expect(lines).toEqual(['Tags', '·All notes', '>home', '·Untagged']);

    unmount();
  });

  it('3: WHEN a tag of 30 characters a is rendered with divider and width={20} THEN every frame line has a length of at most 20 and ends with │', async () => {
    const { lastFrame, unmount } = render(
      <TagPane tags={['a'.repeat(30)]} selectedIndex={0} focused={false} width={20} height={5} divider />
    );

    await delay(50);

    const frame = lastFrame() ?? '';
    const lines = frame.split('\n').map((l) => l.trimEnd());

    for (const line of lines) {
      if (line.length > 0) {
        expect(line.length).toBeLessThanOrEqual(20);
        expect(line.endsWith('│')).toBe(true);
      }
    }

    unmount();
  });

  it('4: WHEN App width={80} height={24} with the tags home and work gets t THEN the first frame line starts with Tags and contains │Notes', async () => {
    const store = makeStore({ stubClient: {} });

    testNotes.forEach((note, idx) => {
      const noteId = eid(`note-${idx + 1}`);
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

    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('note-3'),
      tagName: 'work' as any,
    });
    store.dispatch({
      type: 'ADD_NOTE_TAG',
      noteId: eid('note-4'),
      tagName: 'home' as any,
    });

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('t');
    await delay(50);

    const frame = lastFrame() ?? '';
    const firstLine = frame.split('\n')[0] ?? '';

    expect(firstLine.startsWith('Tags')).toBe(true);
    expect(frame).toContain('│Notes');

    stdin.write('\u001b');
  });

  it('5: WHEN src/tui/TagPane.tsx is read THEN it contains <Divider exactly 1 time and <PaneHeading label="Tags" exactly 1 time', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src', 'tui', 'TagPane.tsx'),
      'utf-8'
    );

    const dividerMatches = (content.match(/<Divider/g) ?? []).length;
    const paneHeadingTagsMatches = (content.match(/<PaneHeading label="Tags"/g) ?? []).length;

    expect(dividerMatches).toBe(1);
    expect(paneHeadingTagsMatches).toBe(1);
  });
});
