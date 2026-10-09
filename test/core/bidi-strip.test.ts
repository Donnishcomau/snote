/**
 * T410: security fix (F069, S4-07) — terminal text and export file names
 * drop bidi controls, zero-width characters and line/paragraph
 * separators, keeping the emoji joiner U+200D (ZWJ). Invisible
 * characters are written as \uXXXX escapes, and the element is built
 * with React.createElement, so this file stays plain TypeScript (.ts)
 * like test/integration/second-start-tags.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { sanitizeForTerminal } from '../../src/core/sanitize';
import { exportFileName } from '../../src/core/export-note';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from '../tui/fixtures';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// `report` + RLO (U+202E) + `dm.exe`: displays as `reportexe.md` when kept.
const rloTitle = 'report‮dm.exe';

// a..j separated by ZWSP, ZWNJ, LRM, RLM, LRE, FSI, PDI, LSP and P
// separators — every one of them removed; ZWJ (U+200D) is not among them.
const invisibleLetters = 'a​b‌c‎d‏e‪f⁦g⁩h i j';

// family emoji: three people joined by ZWJ (U+200D); must survive.
const zwj = '‍';
const family = '👨‍👩‍👧';

// the note content of Acceptance 4: RLO in the title plus an OSC-52
// clipboard sequence; `\n\nbody` on the second and third lines.
const evilContent = 'inv‮oice.exe\x1b]52;c;QQ\x07\n\nbody';

describe('bidi strip (F069 S4-07)', () => {
  it("1: WHEN sanitizeForTerminal and exportFileName each get `report‮dm.exe` THEN each returns `reportdm.exe`", () => {
    expect(sanitizeForTerminal(rloTitle)).toBe('reportdm.exe');
    expect(exportFileName(rloTitle)).toBe('reportdm.exe');
  });

  it("2: WHEN each gets `a​b‌c‎d‏e‪f⁦g⁩h\u2028i\u2029j` THEN each returns `abcdefghij`", () => {
    expect(sanitizeForTerminal(invisibleLetters)).toBe('abcdefghij');
    expect(exportFileName(invisibleLetters)).toBe('abcdefghij');
  });

  it("3: WHEN sanitizeForTerminal gets `family 👨‍👩‍👧 ok` and exportFileName gets `family 👨‍👩‍👧` THEN both results still contain `\\u200D` (each is returned unchanged)", () => {
    expect(sanitizeForTerminal(`family ${family} ok`)).toBe(`family ${family} ok`);
    expect(exportFileName(`family ${family}`)).toBe(`family ${family}`);
    expect(sanitizeForTerminal(`family ${family} ok`)).toContain(zwj);
    expect(exportFileName(`family ${family}`)).toContain(zwj);
  });

  it("4: WHEN the App lists a note whose content is `inv‮oice.exe\\x1b]52;c;QQ\\x07\\n\\nbody` THEN the frame contains `invoice.exe`, contains no `‮` and no `\\x1b]`, and the note's content is the same string as before the render", async () => {
    const store = makeStore({ stubClient: {} });
    const note = makeNote('b1', evilContent) as Note;
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('b1') as never,
      note: note as never,
    });

    const { lastFrame, unmount } = render(
      React.createElement(App, { store, width: 80, height: 24 })
    );
    await delay(50);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('invoice.exe');
    expect(frame).not.toContain('‮');
    expect(frame).not.toContain('\x1b]');

    const stored = store.getState().data.notes.get(eid('b1'));
    expect(stored?.content).toBe(evilContent);
    expect(stored?.content).toBe(note.content);
    unmount();
  });
});
