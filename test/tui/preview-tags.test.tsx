import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import Preview from '../../src/tui/Preview';
import { makeNote } from './fixtures';
import type { EntityId, TagName } from '@vendor/types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const lines = (frame: string | string[][] | undefined): string[] => {
  if (!frame) return [];
  if (typeof frame === 'string') return frame.split('\n');
  return frame.map(row => stripAnsi(Array.isArray(row) ? row.join('') : row));
};

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as TagName;

describe('Preview tags', () => {
  it('1: WHEN a note "Tagged note\\nbody" with the tags work and home is rendered THEN the first 4 frame lines are exactly "│Preview: Tagged note", "│#work #home", "│", "│body"', async () => {
    const note = makeNote('t1', 'Tagged note\nbody', { tags: ['work', 'home'] });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    expect(frameLines[0]).toBe('│Preview: Tagged note');
    expect(frameLines[1]).toBe('│#work #home');
    expect(frameLines[2]).toBe('│g add tag');
    expect(frameLines[3]).toBe('│body');
  });

  it('2: WHEN a note with the tags work and bob@example.com is rendered THEN the frame contains "#work" and does not contain "bob@example.com"', async () => {
    const note = makeNote('t2', 'Test note\ncontent', { tags: ['work', 'bob@example.com'] });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('#work');
    expect(frameText).not.toContain('bob@example.com');
  });

  it('3: WHEN a note without tags, and a note whose only tag is bob@example.com, are rendered THEN in both frames the second line is "│g add tag" and no line contains "#"', async () => {
    const noteNoTags = makeNote('t3a', 'No tags note\ncontent', { tags: [] });
    const { lastFrame: lastFrame1 } = render(
      <Preview note={noteNoTags} width={80} height={12} />
    );
    await delay(50);
    let frame = lastFrame1() ?? '';
    let frameLines = lines(frame);
    expect(frameLines[1]).toBe('│g add tag');
    const frameText1 = frameLines.join('\n');
    expect(frameText1).not.toContain('#');

    const noteEmailOnly = makeNote('t3b', 'Email tag note\ncontent', { tags: ['bob@example.com'] });
    const { lastFrame: lastFrame2 } = render(
      <Preview note={noteEmailOnly} width={80} height={12} />
    );
    await delay(50);
    frame = lastFrame2() ?? '';
    frameLines = lines(frame);
    expect(frameLines[1]).toBe('│g add tag');
    const frameText2 = frameLines.join('\n');
    expect(frameText2).not.toContain('#');
  });

  it('4: WHEN a tagged note with 30 lines row 01 to row 30 is rendered THEN the frame contains "row 08" and not "row 09", and has at most 10 lines', async () => {
    const content = Array.from({ length: 30 }, (_, i) => `row ${(i + 1).toString().padStart(2, '0')}`).join('\n');
    const note = makeNote('t4', content, { tags: ['work'] });
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('row 08');
    expect(frameText).not.toContain('row 09');
    expect(frameLines.length).toBeLessThanOrEqual(10);
  });

  it('5: WHEN <App width={80} height={24}> shows a store whose first note has the tag work, and g, todo, "\\r", "\\u001b" are written THEN the frame contains "#work #todo"', async () => {
    const store = makeStore({ stubClient: {} });
    const now = Date.now();

    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('t5'),
      note: {
        id: eid('t5'),
        content: 'App test note\nsome content',
        systemTags: [],
        tags: [tname('work')],
        deleted: false,
        modificationDate: now,
        creationDate: now,
      },
    });
    store.dispatch({ type: 'SELECT_NOTE', noteId: eid('t5') });

    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    // g opens tag editor
    stdin.write('g');
    await delay(50);
    // type "todo" as tag name
    stdin.write('todo');
    await delay(50);
    // enter to add tag
    stdin.write('\r');
    await delay(50);
    // escape to close tag editor
    stdin.write('\u001b');
    await delay(50);
    const frame = lastFrame() ?? '';
    const frameLines = lines(frame);
    const frameText = frameLines.join('\n');
    expect(frameText).toContain('#work #todo');
  });
});
