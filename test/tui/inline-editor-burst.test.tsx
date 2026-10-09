/**
 * F161: keys that reach the inline editor in one burst (several stdin
 * writes, or one chunk, with no redraw in between) are all kept, in order.
 * S6-01: caret moves in a burst each move the caret once, in order.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const BASE = 'start';
const CTRL_S = '\x13';
const BACKSPACE = '\x7f';
const LEFT = '\x1b[D';
const RIGHT = '\x1b[C';
const UP = '\x1b[A';
const DOWN = '\x1b[B';
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

/** `n` letters a..z repeating, so order mistakes are visible. */
function letters(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(97 + (i % 26));
  return s;
}

describe('inline editor key bursts (F161)', () => {
  let store: ReturnType<typeof makeStore>;
  const saved = (): string | undefined => store.getState().data.notes.get(eid('t1'))?.content;

  const open = async (content = BASE) => {
    seedNote(store, content);
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, `>${content.slice(0, 5)}`);
    r.stdin.write('i');
    await waitForFrame(r.lastFrame, 'Ctrl+S');
    return r;
  };

  /** Write each key with no wait in between, then Ctrl+S; wait for the save. */
  const burstAndSave = async (keys: string[], expected: string): Promise<string> => {
    const { stdin, lastFrame } = await open();
    for (const k of keys) stdin.write(k);
    stdin.write(CTRL_S);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === expected);
    return frame;
  };

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('1: WHEN the note `start` is open in the inline editor and `a`, `b`, `c` are written as three writes with no redraw between them and Ctrl+S is pressed THEN the saved content is `startabc`', async () => {
    const frame = await burstAndSave(['a', 'b', 'c'], 'startabc');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startabc');
  });

  it('2: WHEN the note `start` is open in the inline editor and `ab`, Backspace, `cd` are written as one chunk and Ctrl+S is pressed THEN the saved content is `startacd`', async () => {
    const frame = await burstAndSave([`ab${BACKSPACE}cd`], 'startacd');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startacd');
  });

  it('3: WHEN the note `start` is open in the inline editor and 20 letters `abcdefghijklmnopqrst` are written as 20 writes with no redraw between them and Ctrl+S is pressed THEN the saved content is `startabcdefghijklmnopqrst`', async () => {
    const twenty = letters(20);
    expect(twenty).toBe('abcdefghijklmnopqrst');
    const frame = await burstAndSave([...twenty], 'startabcdefghijklmnopqrst');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startabcdefghijklmnopqrst');
  });

  it('4: WHEN the note `start` is open in the inline editor and 200 letters (a..z repeating) are written as 200 writes with no redraw between them and Ctrl+S is pressed THEN the saved content is `start` followed by all 200 letters in order', async () => {
    const many = letters(200);
    expect(many).toHaveLength(200);
    const frame = await burstAndSave([...many], `start${many}`);
    expect(frame).toContain('Preview:');
    expect(saved()).toBe(`start${many}`);
    expect(saved()).toHaveLength(205);
  });

  it('5: WHEN the note `start` is open in the inline editor and `a`, `b`, Enter, `c`, `d` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `startab\\ncd`', async () => {
    const frame = await burstAndSave(['a', 'b', '\r', 'c', 'd'], 'startab\ncd');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startab\ncd');
  });

  it('6: WHEN the note `start` is open in the inline editor and `a`, `b`, `c`, Backspace, `d` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `startabd`', async () => {
    const frame = await burstAndSave(['a', 'b', 'c', BACKSPACE, 'd'], 'startabd');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startabd');
  });

  it('7: WHEN the note `start` is open in the inline editor and `ab`, Left arrow, `cd` are written as one chunk and Ctrl+S is pressed THEN the saved content is `startacdb`', async () => {
    const frame = await burstAndSave([`ab${LEFT}cd`], 'startacdb');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startacdb');
  });

  it('8: WHEN the note `start` is open in the inline editor and `ab`, Backspace, `cd` are written as one chunk THEN the editor frame shows `startacd` before any save', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(`ab${BACKSPACE}cd`);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('startacd') && f.includes('Ctrl+S'));
    expect(frame).toContain('startacd');
  });

  it('9: WHEN the note `start` is open in the inline editor and `a`, `b`, `c`, Left, Left, `X` are written as six writes with no redraw between them and Ctrl+S is pressed THEN the saved content is `startaXbc`', async () => {
    const frame = await burstAndSave(['a', 'b', 'c', LEFT, LEFT, 'X'], 'startaXbc');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startaXbc');
  });

  it('10: WHEN the note `start` is open in the inline editor and `abc`, Left, Left, `X` are written as one chunk and Ctrl+S is pressed THEN the saved content is `startaXbc`', async () => {
    const frame = await burstAndSave([`abc${LEFT}${LEFT}X`], 'startaXbc');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startaXbc');
  });

  it('11: WHEN the note `start` is open in the inline editor and Left, Left, Left, `W` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `stWart`', async () => {
    const frame = await burstAndSave([LEFT, LEFT, LEFT, 'W'], 'stWart');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('stWart');
  });

  it('12: WHEN the note `start` is open in the inline editor and Enter, `xyz`, Up, `U`, Down, `D` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `staUrt\\nxyzD`', async () => {
    const frame = await burstAndSave(['\r', 'x', 'y', 'z', UP, 'U', DOWN, 'D'], 'staUrt\nxyzD');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('staUrt\nxyzD');
  });

  it('13: WHEN the note `start` is open in the inline editor and Enter, `ab`, Up, Up, Down, Left, `X` are written as one chunk and Ctrl+S is pressed THEN the saved content is `start\\naXb`', async () => {
    const frame = await burstAndSave([`\r`, `ab${UP}${UP}${DOWN}${LEFT}X`], 'start\naXb');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('start\naXb');
  });

  it('14: WHEN the note `start` is open in the inline editor and `a`, `b`, `c`, Left, Left, `X`, Right, `Y` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `startaXbYc`', async () => {
    const frame = await burstAndSave(['a', 'b', 'c', LEFT, LEFT, 'X', RIGHT, 'Y'], 'startaXbYc');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startaXbYc');
  });

  it('15: WHEN the note `start` is open in the inline editor and Enter, `ab`, Left, Left, Left, `X` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `startX\\nab`', async () => {
    const frame = await burstAndSave(['\r', 'a', 'b', LEFT, LEFT, LEFT, 'X'], 'startX\nab');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startX\nab');
  });

  it('16: WHEN the note `start` is open in the inline editor and `abc`, Ctrl+A, `X`, Ctrl+E, `Y` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `XstartabcY`', async () => {
    const frame = await burstAndSave(['a', 'b', 'c', CTRL_A, 'X', CTRL_E, 'Y'], 'XstartabcY');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('XstartabcY');
  });

  it('17: WHEN the note `start` is open in the inline editor and `a`, `b`, Backspace, Left, Left, `X`, Right, Backspace, `Y` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `starXYa`', async () => {
    const frame = await burstAndSave(['a', 'b', BACKSPACE, LEFT, LEFT, 'X', RIGHT, BACKSPACE, 'Y'], 'starXYa');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('starXYa');
  });

  it('18: WHEN the note `start` is open in the inline editor and `abc`, Left, Left, `X` are written as one chunk THEN the editor frame shows `startaXbc` before any save', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(`abc${LEFT}${LEFT}X`);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('startaXbc') && f.includes('Ctrl+S'));
    expect(frame).toContain('startaXbc');
  });

  it('19: WHEN the note `start` is open in the inline editor and `a`, `b`, Down, Down, Up, `X` are written with no redraw between them and Ctrl+S is pressed THEN the saved content is `startab\\nX\\n`', async () => {
    const frame = await burstAndSave(['a', 'b', DOWN, DOWN, UP, 'X'], 'startab\nX\n');
    expect(frame).toContain('Preview:');
    expect(saved()).toBe('startab\nX\n');
  });

  it('20: WHEN a note of one 120-character line `abcdefghi ` x12 (wrapped at 47 columns) is open in the inline editor and Up, `X`, Up, `Y`, Down, Down, `Z` are written with no redraw between them and Ctrl+S is pressed THEN `X` is saved at offset `73`, `Y` at offset `27` and `Z` at the end', async () => {
    const line = 'abcdefghi '.repeat(12);
    const expected = `${line.slice(0, 27)}Y${line.slice(27, 73)}X${line.slice(73)}Z`;
    const { stdin, lastFrame } = await open(line);
    // the editor has measured its width: it cuts the line at 47 columns
    // itself (before that, the terminal wraps it at a space)
    await waitForFrame(lastFrame, `│${line.slice(0, 47)}\n`);
    for (const k of [UP, 'X', UP, 'Y', DOWN, DOWN, 'Z']) stdin.write(k);
    stdin.write(CTRL_S);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Preview:') && saved() === expected);
    expect(frame).toContain('Preview:');
    expect(saved()).toBe(expected);
    expect(saved()?.indexOf('Y')).toBe(27);
    expect(saved()?.replace('Y', '').indexOf('X')).toBe(73);
    expect(saved()?.endsWith('Z')).toBe(true);
  });
});
