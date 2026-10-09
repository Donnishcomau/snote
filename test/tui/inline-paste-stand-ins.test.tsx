/**
 * T510: text pasted into the inline editor is drawn as visible stand-ins and
 * saved as pasted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const RLO = String.fromCharCode(0x202e);
const REPL = String.fromCharCode(0xfffd);
const BASE = 'Groceries\nmilk';
const PASTE_1 = `${ESC}[200~ab${ESC}[45mc${RLO}d${ESC}[201~`;
const OSC = `${ESC}]52;c;UFdORUQ=${BEL}`;

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

describe('inline editor pasted text stand-ins (T510)', () => {
  let store: ReturnType<typeof makeStore>;
  const saved = (): string | undefined => store.getState().data.notes.get(eid('t1'))?.content;

  const open = async () => {
    seedNote(store, BASE);
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, '>Groceries');
    r.stdin.write('i');
    await waitForFrame(r.lastFrame, 'Ctrl+S');
    return r;
  };

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('1: WHEN the note `Groceries\\nmilk` is opened with `i` and `\\x1b[200~ab\\x1b[45mc‮d\\x1b[201~` is written THEN the frame contains `ab␛[45mc�d` and contains neither `\\x1b[45m` nor `‮`', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(PASTE_1);
    await waitForFrame(
      lastFrame,
      (f) => f.includes(`ab␛[45mc${REPL}d`) && !f.includes(`${ESC}[45m`) && !f.includes(RLO),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain(`ab␛[45mc${REPL}d`);
    expect(frame).not.toContain(`${ESC}[45m`);
    expect(frame).not.toContain(RLO);
  });

  it('2: WHEN `X` is then written and Ctrl+S pressed THEN the note content is exactly `Groceries\\nmilkab\\x1b[45mc‮dX`', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(PASTE_1);
    await waitForFrame(lastFrame, `ab␛[45mc${REPL}d`);
    stdin.write('X');
    await waitForFrame(lastFrame, `ab␛[45mc${REPL}dX`);
    stdin.write('\x13');
    await vi.waitFor(() => expect(saved()).toBe('Groceries\nmilkab\x1b[45mc‮dX'));
  });

  it('3: WHEN `\\x1b[200~\\x1b]52;c;UFdORUQ=\\x07\\x1b[201~` is written in the editor THEN the frame contains `␛]52;c;UFdORUQ=␇` and contains neither `\\x1b]52` nor `\\x07`, and after Ctrl+S the note content is `Groceries\\nmilk\\x1b]52;c;UFdORUQ=\\x07`', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(`${ESC}[200~${OSC}${ESC}[201~`);
    await waitForFrame(
      lastFrame,
      (f) => f.includes('␛]52;c;UFdORUQ=␇') && !f.includes(`${ESC}]52`) && !f.includes(BEL),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('␛]52;c;UFdORUQ=␇');
    expect(frame).not.toContain(`${ESC}]52`);
    expect(frame).not.toContain(BEL);
    stdin.write('\x13');
    await vi.waitFor(() => expect(saved()).toBe('Groceries\nmilk\x1b]52;c;UFdORUQ=\x07'));
  });

  it('4: WHEN the paste of line 1 is written, then Backspace `1` time THEN the frame contains `ab␛[45mc\\uFFFD` and not `c\\uFFFDd`, and Ctrl+S saves `Groceries\\nmilkab\\x1b[45mc\\u202e` (one stand-in is one unit)', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(PASTE_1);
    await waitForFrame(lastFrame, `ab␛[45mc${REPL}d`);
    stdin.write('\x7f');
    await waitForFrame(
      lastFrame,
      (f) => f.includes(`ab␛[45mc${REPL}`) && !f.includes(`c${REPL}d`),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain(`ab␛[45mc${REPL}`);
    expect(frame).not.toContain(`c${REPL}d`);
    stdin.write('\x13');
    await vi.waitFor(() => expect(saved()).toBe('Groceries\nmilkab\x1b[45mc‮'));
  });

  it('5: WHEN the paste `plain` is written and Ctrl+S pressed THEN the frame contained `milkplain` and the note content is exactly `Groceries\\nmilkplain`', async () => {
    const { stdin, lastFrame } = await open();
    stdin.write(`${ESC}[200~plain${ESC}[201~`);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('milkplain'));
    expect(frame).toContain('milkplain');
    stdin.write('\x13');
    await vi.waitFor(() => expect(saved()).toBe('Groceries\nmilkplain'));
  });
});
