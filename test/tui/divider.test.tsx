import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Divider } from '../../src/tui/Divider';
import { Preview } from '../../src/tui/Preview';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote, testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const lines = (frame: string | string[][] | undefined): string[] => {
  if (!frame) return [];
  if (typeof frame === 'string') return frame.split('\n');
  // array of arrays: each sub-array is one line with potential ANSI codes
  return frame.map(row => stripAnsi(Array.isArray(row) ? row.join('') : row));
};

describe('T191 Divider component', () => {
  it('1: WHEN <Divider height={4} /> is rendered THEN the frame is exactly "│\\n│\\n│\\n│"; WHEN height={0} THEN the frame contains no "│"', async () => {
    const { lastFrame } = render(<Divider height={4} />);
    await delay(0);
    const frame = lastFrame();
    const frameStr = typeof frame === 'string' ? frame : '';
    expect(frameStr).toBe('│\n│\n│\n│');

    const { lastFrame: lastFrame0 } = render(<Divider height={0} />);
    await delay(0);
    const frame0 = lastFrame0() ?? '';
    const frame0Str = typeof frame0 === 'string' ? frame0 : '';
    expect(frame0Str).not.toContain('│');
  });

  it('2: WHEN <Preview note={makeNote("d", "Div note\\nbody")} width={80} height={12} /> is rendered THEN the first frame line is "│Preview: Div note", the frame has 10 lines and every one of them starts with "│"', async () => {
    const note = makeNote('d', 'Div note\nbody');
    const { lastFrame } = render(
      <Preview note={note} width={80} height={12} />
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    const frameStr = typeof frame === 'string' ? frame : '';
    const frameLines = frameStr.split('\n');
    expect(frameLines[0]).toBe('│Preview: Div note');
    expect(frameLines.length).toBe(10);
    for (const line of frameLines) {
      expect(line).toMatch(/^│/);
    }
  });
});

describe('T191 Divider in App', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

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
  });

  it('3: WHEN <App width={80} height={24}> shows the 5 testNotes THEN the first frame line contains "Notes" and "│Preview: Pinned note", and every frame line has a length of at most 80', async () => {
    const { lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    const frame = lastFrame() ?? '';
    const frameStr = typeof frame === 'string' ? frame : '';
    const frameLines = frameStr.split('\n');
    expect(frameLines[0]).toContain('Notes');
    expect(frameStr).toContain('│Preview: Pinned note');
    for (const line of frameLines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('4: WHEN the app is rendered at width 40 and "\\r" is written THEN the frame contains "│Preview: Pinned note" and every line has at most 40 characters', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={40} height={24} />
    );

    await delay(50);

    stdin.write('\r');
    await delay(50);

    const frame = lastFrame() ?? '';
    const frameStr = typeof frame === 'string' ? frame : '';
    expect(frameStr).toContain('│Preview: Pinned note');
    const frameLines = frameStr.split('\n');
    for (const line of frameLines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('5: WHEN src/tui/Preview.tsx is read THEN it contains "<Divider" exactly 2 times and does not contain "marginLeft"', () => {
    const content = fs.readFileSync(
      path.resolve(process.cwd(), 'src/tui/Preview.tsx'),
      'utf8'
    );
    const dividerMatches = content.match(/<Divider/g);
    expect(dividerMatches).toHaveLength(2);
    expect(content).not.toContain('marginLeft');
  });
});
