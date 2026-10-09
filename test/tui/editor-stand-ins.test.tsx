/**
 * T412: the inline editor shows control, bidi and zero-width characters as
 * visible stand-ins and saves the note's bytes unchanged.
 *
 * The TextArea draws each character raw, so SGR escapes inside a note could
 * reach the terminal, and the library's own newline normalisation dropped
 * `\r`. InlineEditor now renders a stand-in version of the text (one UTF-16
 * unit per replaced unit, so every offset and [line, col] cursor position
 * matches the real text) and maps each edit back onto the real bytes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

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

const settle = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 50));
};

const sgr = String.fromCharCode(27); // ESC, written so this file never holds a raw control byte
const nul = String.fromCharCode(0);
const bel = String.fromCharCode(7);
const st = String.fromCharCode(156); // C1 STRING TERMINATOR

const colourNote = `Title\n\nred ${sgr}[45mRED${sgr}[0m conceal ${sgr}[8mHIDE${sgr}[28m end`;
const oscNote =
  `T\n\nb ${sgr}]52;c;UFdORUQ=${bel} ${sgr}]8;;http://evil${sgr}\\L${sgr}]8;;${sgr}\\ ${st}52;c;AA${st} end`;

describe('inline editor control/bidi/zero-width stand-ins (T412)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it(`1: WHEN \`i\` opens the note \`Title\\n\\nred ${sgr}[45mRED${sgr}[0m conceal ${sgr}[8mHIDE${sgr}[28m end\` THEN the frame contains \`␛[45mRED\` and \`␛[8mHIDE\` and contains neither \`${sgr}[45m\` nor \`${sgr}[8m\``, async () => {
    seedNote(store, colourNote);

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await settle();

    stdin.write('i');
    await settle();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('␛[45mRED');
    expect(frame).toContain('␛[8mHIDE');
    expect(frame).not.toContain(`${sgr}[45m`);
    expect(frame).not.toContain(`${sgr}[8m`);
  });

  it('2: WHEN `X` is typed and Ctrl+S pressed on that note THEN the saved content equals the original plus `X`, byte for byte', async () => {
    seedNote(store, colourNote);

    const { stdin } = render(<App store={store} width={80} height={24} />);
    await settle();

    stdin.write('i');
    await settle();
    stdin.write('X');
    await settle();
    stdin.write('\x13');
    await settle();

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe(colourNote + 'X');
  });

  it('3: WHEN the note `Title\\r\\nline two\\r\\n` is opened, `X` typed and saved THEN the frame showed `␍` and the saved content is exactly `Title\\r\\nline two\\r\\nX`', async () => {
    const crlfNote = 'Title\r\nline two\r\n';
    seedNote(store, crlfNote);

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await settle();

    stdin.write('i');
    await settle();

    expect(lastFrame() ?? '').toContain('␍');

    stdin.write('X');
    await settle();
    stdin.write('\x13');
    await settle();

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('Title\r\nline two\r\nX');
  });

  it(`4: WHEN the note \`a${sgr}b${sgr}[1mc end\` is opened, Left is written four times, then Backspace, \`␛\`, \`Q\` and Ctrl+S THEN the saved content is exactly \`a${sgr}b${sgr}[1m␛Q end\``, async () => {
    const escNote = `a${sgr}b${sgr}[1mc end`;
    seedNote(store, escNote);

    const { stdin } = render(<App store={store} width={80} height={24} />);
    await settle();

    stdin.write('i');
    await settle();
    for (let k = 0; k < 4; k++) {
      stdin.write('\x1b[D'); // Left, as an xterm cursor sequence (never an Escape event)
      await new Promise((r) => setTimeout(r, 10));
    }
    stdin.write('\x7F'); // Backspace deletes the `c`
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('␛'); // typed U+241B stays U+241B in the real bytes
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('Q');
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\x13');
    await settle();

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe(`a${sgr}b${sgr}[1m␛Q end`);
  });

  it('5: WHEN the note `T\\n\\nreport‮dm.exe ​x⁦y⁩ 👨‍👩‍👧` is opened THEN the frame contains `�` and `‍` and none of `‮`, `​`, `⁦`, `⁩`, and saving after `X` gives the original plus `X`', async () => {
    const bidiNote = 'T\n\nreport‮dm.exe ​x⁦y⁩ 👨‍👩‍👧';
    seedNote(store, bidiNote);

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await settle();

    stdin.write('i');
    await settle();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('�');
    expect(frame).toContain('‍');
    expect(frame).not.toContain('‮');
    expect(frame).not.toContain('​');
    expect(frame).not.toContain('⁦');
    expect(frame).not.toContain('⁩');

    stdin.write('X');
    await settle();
    stdin.write('\x13');
    await settle();

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe(bidiNote + 'X');
  });

  it(`6: WHEN the note \`T\\n\\nb ${sgr}]52;c;UFdORUQ=${bel} ${sgr}]8;;http://evil${sgr}\\\\L${sgr}]8;;${sgr}\\\\ ${st}52;c;AA${st} end\` is opened THEN the frame contains no \`${sgr}]\`, no \`${bel}\` and no character in U+0080-U+009F, and saving after \`X\` gives the original plus \`X\``, async () => {
    seedNote(store, oscNote);

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await settle();

    stdin.write('i');
    await settle();

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain(`${sgr}]`);
    expect(frame).not.toContain(bel);
    expect(/[\u0080-\u009f]/.test(frame)).toBe(false);

    stdin.write('X');
    await settle();
    stdin.write('\x13');
    await settle();

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe(oscNote + 'X');
  });
});
