/**
 * F174 (T515): in the inline editor the Delete key removes the grapheme
 * after the caret; at the end of the text it does nothing; Backspace still
 * removes the character before the caret.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const CTRL_S = '\x13';
const BACKSPACE = '\x7f';
const LEFT = '\x1b[D';
const RIGHT = '\x1b[C';
const UP = '\x1b[A';
const DELETE = '\x1b[3~';
const CTRL_A = '\x01';
const CTRL_E = '\x05';

function seedNote(store: ReturnType<typeof makeStore>, content: string): void {
  const now = Date.now();
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: {
      content,
      systemTags: [],
      tags: [],
      deleted: false,
      modificationDate: now,
      creationDate: now,
    },
  });
}

describe('inline editor forward delete (T515)', () => {
  let store: ReturnType<typeof makeStore>;
  const saved = (): string | undefined => store.getState().data.notes.get(eid('t1'))?.content;

  /** Seed the note, render, wait for its list row, then open the editor. */
  const open = async (content: string) => {
    seedNote(store, content);
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, `>${content[0]}`);
    r.stdin.write('i');
    await waitForFrame(r.lastFrame, 'Ctrl+S');
    return r;
  };

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('1: WHEN the note `start` is open in the inline editor, Left, Left, Delete (`\\x1b[3~`) are written and the frame shows `stat` THEN Ctrl+S saves `stat` (the `r` after the caret is removed, not the `a` before it)', async () => {
    const { stdin, lastFrame } = await open('start');
    stdin.write(LEFT);
    stdin.write(LEFT);
    stdin.write(DELETE);
    await waitForFrame(lastFrame, (f) => f.includes('Ctrl+S') && f.includes('stat'));
    stdin.write(CTRL_S);
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === 'stat');
    expect(saved()).toBe('stat');
  });

  it('2: WHEN the note `start` is open with the caret at its end and Delete, `X` are written and Ctrl+S is pressed THEN the saved content is `startX` (Delete at the end of the text removes nothing)', async () => {
    const { stdin, lastFrame } = await open('start');
    stdin.write(DELETE);
    stdin.write('X');
    stdin.write(CTRL_S);
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === 'startX');
    expect(saved()).toBe('startX');
  });

  it('3: WHEN the note `start` is open in the inline editor and Left, Left, Backspace (`\\x7f`) are written and Ctrl+S is pressed THEN the saved content is `strt` (Backspace still removes the character before the caret)', async () => {
    const { stdin, lastFrame } = await open('start');
    stdin.write(LEFT);
    stdin.write(LEFT);
    stdin.write(BACKSPACE);
    stdin.write(CTRL_S);
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === 'strt');
    expect(saved()).toBe('strt');
  });

  it('4: WHEN the note `start` is open in the inline editor and Left, Left, Delete, Delete, `X` are written as one chunk and Ctrl+S is pressed THEN the saved content is `staX`', async () => {
    const { stdin, lastFrame } = await open('start');
    stdin.write(`${LEFT}${LEFT}${DELETE}${DELETE}X`);
    stdin.write(CTRL_S);
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === 'staX');
    expect(saved()).toBe('staX');
  });

  it('5: WHEN the note `start\\nend` is open, Up, Ctrl+E, Delete are written and Ctrl+S is pressed THEN the saved content is `startend`, and WHEN the note `a🇯🇵b` is open, Ctrl+A, Right, Delete are written THEN the saved content is `ab` (one grapheme)', async () => {
    const r1 = await open('start\nend');
    r1.stdin.write(UP);
    r1.stdin.write(CTRL_E);
    r1.stdin.write(DELETE);
    r1.stdin.write(CTRL_S);
    await waitForFrame(r1.lastFrame, (f) => f.includes('Preview:') && saved() === 'startend');
    expect(saved()).toBe('startend');
    store = makeStore({ stubClient: {} });
    const r2 = await open('a🇯🇵b');
    r2.stdin.write(CTRL_A);
    r2.stdin.write(RIGHT);
    r2.stdin.write(DELETE);
    r2.stdin.write(CTRL_S);
    await waitForFrame(r2.lastFrame, (f) => f.includes('Preview:') && saved() === 'ab');
    expect(saved()).toBe('ab');
  });

  it('6: WHEN the note `a‮b\\x1bc` is open and Ctrl+A, Right, Delete are written THEN the frame shows `ab␛c` with no `‮` and no `\\x1b`, and Ctrl+S saves `ab\\x1bc` (only the bidi unit is removed; the ESC byte is kept)', async () => {
    const { stdin, lastFrame } = await open('a‮b\x1bc');
    stdin.write(CTRL_A);
    stdin.write(RIGHT);
    stdin.write(DELETE);
    await waitForFrame(lastFrame, (f) => f.includes('Ctrl+S') && f.includes('ab␛c') && !f.includes('‮') && !f.includes('\x1b'));
    stdin.write(CTRL_S);
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === 'ab\x1bc');
    expect(saved()).toBe('ab\x1bc');
  });
});
