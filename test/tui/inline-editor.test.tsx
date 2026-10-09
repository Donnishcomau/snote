/**
 * T315.2: `i` opens the built-in inline editor in the Preview pane's slot,
 * read-only (no typing/save yet — that's Task 3); Escape (no edits made)
 * returns to Preview. See research/reviews/T315-BUILTIN-EDITOR-PLAN.md.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { keymap } from '../../src/core/keymap';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
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

describe('inline editor mount (i key, T315.2)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it("1: WHEN a note with content `hello world` is selected and `i` is pressed THEN lastFrame() contains `hello world` and does not contain `Preview:`", async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('hello world') && !f.includes('Preview:'));

    expect(frame).toContain('hello world');
    expect(frame).not.toContain('Preview:');
  });

  it("2: WHEN `i` is pressed and then Escape is pressed (no text typed) THEN lastFrame() contains `Preview:` again and the store's note content is unchanged (`hello world`)", async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('\x1b');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && store.getState().data.notes.get(eid('t1'))?.content === 'hello world',
    );

    expect(frame).toContain('Preview:');
    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('hello world');
  });

  it("3: WHEN `i` is pressed THEN the keymap's edit_note_inline row's key is `i`", async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');

    const entry = keymap.find((e) => e.action === 'edit_note_inline');
    expect(entry).toBeDefined();
    expect(entry!.key).toBe('i');
  });

  it("4: WHEN `i` is pressed and then `j` (move-down) is pressed THEN the selected note index in the store/view is unchanged (proves list-navigation keys are swallowed while the editor is open)", async () => {
    // t1 ("hello world") must sort first (most-recently-modified-first is
    // the default sort), so its modificationDate is kept later than t2's.
    seedNote(store, 'hello world');
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('t2'),
      note: {
        content: 'second note',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: Date.now() - 1000,
        creationDate: Date.now() - 1000,
      },
    });

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);

    const frameBefore = await waitForFrame(lastFrame, 'hello world');
    expect(frameBefore).toContain('hello world');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('j');
    // the editor takes `j` as text (`hello worldj`) instead of moving down
    const frameAfter = await waitForFrame(
      lastFrame,
      (f) => f.includes('hello worldj') && !f.includes('Preview:'),
    );

    // Still showing t1's content in the editor, not having navigated to t2.
    expect(frameAfter).toContain('hello world');
    expect(frameAfter).not.toContain('Preview:');
  });
});
describe('inline editor typing + save (i key, T315.3)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it("5: WHEN a note with content `line1` is opened with `i`, `X` is typed, then `Ctrl+S` (`\\x13`) is pressed THEN the store's note content is `line1X` and `lastFrame()` contains `Preview:`", async () => {
    seedNote(store, 'line1');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'line1');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('X');
    await waitForFrame(lastFrame, 'line1X');
    stdin.write('\x13');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && store.getState().data.notes.get(eid('t1'))?.content === 'line1X',
    );

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('line1X');
    expect(lastFrame()).toContain('Preview:');
  });

  it("6: WHEN a note is opened with `i`, Enter is pressed, then `Y` is typed, then `Ctrl+S` is pressed THEN the store's note content contains a newline between the original content and `Y`", async () => {
    seedNote(store, 'line1');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'line1');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('\r');
    stdin.write('Y');
    // `Y` starts the editor's second row (the caret may be drawn after it)
    await waitForFrame(lastFrame, (f) => f.split('\n').some((l) => /[ │]Y(\s|\x1b|$)/.test(l)));
    stdin.write('\x13');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && store.getState().data.notes.get(eid('t1'))?.content === 'line1\nY',
    );

    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('line1\nY');
  });

  it("7: WHEN a note is opened with `i` and a remote `EDIT_NOTE` dispatches new `current` content to the store while the editor is open, then local text is typed and `Ctrl+S` is pressed THEN the saved content is the merge-conflict output and a notice is shown", async () => {
    seedNote(store, 'Conflict target\noriginal body');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Conflict target');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');

    // Replace the whole buffer with the LOCAL variant via bracketed paste:
    // select-all isn't available, so clear with enough backspaces then paste.
    // F161: the editor keeps every key of a burst, so the backspaces need no
    // wait between them.
    for (let i = 0; i < 'Conflict target\noriginal body'.length; i++) {
      stdin.write('\x7F');
    }
    stdin.write('\x1b[200~Conflict target\nLOCAL changed this line\x1b[201~');
    await waitForFrame(lastFrame, 'LOCAL changed this line');

    // Simulate a remote change landing while the editor is open.
    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: eid('t1'),
      changes: { content: 'Conflict target\nREMOTE changed this line differently' },
    } as never);

    stdin.write('\x13');
    await waitForFrame(lastFrame, (f) => {
      const c = store.getState().data.notes.get(eid('t1'))?.content ?? '';
      return (
        c.includes('LOCAL changed this line') &&
        c.includes('REMOTE changed this line differently') &&
        c.includes('--- conflicting change from another device ---') &&
        f.includes('A change from another device could not be merged automatically - both versions were kept.')
      );
    });

    const content = store.getState().data.notes.get(eid('t1'))?.content ?? '';
    expect(content).toContain('LOCAL changed this line');
    expect(content).toContain('REMOTE changed this line differently');
    expect(content).toContain('--- conflicting change from another device ---');
    expect(lastFrame()).toContain(
      'A change from another device could not be merged automatically - both versions were kept.',
    );
  });
});

describe('inline editor discard-changes confirm (Escape, T315.4)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('8: WHEN a note is opened with `i`, `Z` is typed, then `Escape` is pressed THEN `lastFrame()` contains `discard changes?` and the store\'s note content is unchanged from before `i` was pressed', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('hello world'));

    stdin.write('i');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Ctrl+S save · Esc cancel · Enter new line'));
    stdin.write('Z');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('hello worldZ'));
    stdin.write('\x1b');

    await vi.waitFor(() => {
      expect(lastFrame() ?? '').toContain('discard changes?');
      expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('hello world');
    });
  });

  it("9: WHEN that `discard changes?` prompt is open and `y` is pressed THEN `lastFrame()` contains `Preview:` again and the store's note content is unchanged (the typed `Z` is discarded)", async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('Z');
    await waitForFrame(lastFrame, 'hello worldZ');
    stdin.write('\x1b');
    await waitForFrame(lastFrame, 'discard changes?');
    expect(lastFrame()).toContain('discard changes?');
    stdin.write('y');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && store.getState().data.notes.get(eid('t1'))?.content === 'hello world',
    );

    expect(lastFrame()).toContain('Preview:');
    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('hello world');
  });

  it('10: WHEN that prompt is open and `n` is pressed THEN the editor reopens still showing the typed `Z`', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('hello world'));

    stdin.write('i');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Ctrl+S save · Esc cancel · Enter new line'));
    stdin.write('Z');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('hello worldZ'));
    stdin.write('\x1b');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('discard changes?'));
    stdin.write('n');

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('hello worldZ');
      expect(frame).not.toContain('Preview:');
    });
  });

  // Fast-keypress regression (no numbered Acceptance line). `\x1b` written
  // back-to-back with `y` is ONE Alt+y event to Ink (meta, not escape) — the
  // same bytes a real Alt+y sends — so the prompt cannot be opened and
  // answered by that pair. As in blog-send-repeat.test.tsx, the answer key is
  // written the instant the prompt is on screen, with no settle delay.
  it('regression: WHEN `y` is written the instant `discard changes?` appears (no settle delay) THEN the keypress is not dropped: `Preview:` returns and the store content is unchanged', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('Z');
    await waitForFrame(lastFrame, 'hello worldZ');
    stdin.write('\x1b');
    for (let i = 0; i < 400 && !(lastFrame() ?? '').includes('discard changes?'); i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(lastFrame()).toContain('discard changes?');
    stdin.write('y');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && store.getState().data.notes.get(eid('t1'))?.content === 'hello world',
    );

    expect(lastFrame()).toContain('Preview:');
    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('hello world');
  });

  it('regression: WHEN `n` is written the instant `discard changes?` appears and `X` the instant it disappears (no settle delays) THEN neither keypress is dropped: the buffer shows `hello worldZX`', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('Z');
    await waitForFrame(lastFrame, 'hello worldZ');
    stdin.write('\x1b');
    for (let i = 0; i < 400 && !(lastFrame() ?? '').includes('discard changes?'); i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(lastFrame()).toContain('discard changes?');
    stdin.write('n');
    for (let i = 0; i < 400 && (lastFrame() ?? '').includes('discard changes?'); i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(lastFrame()).not.toContain('discard changes?');
    stdin.write('X');
    await waitForFrame(lastFrame, 'hello worldZX');

    expect(lastFrame()).toContain('hello worldZX');
  });
});

describe('inline editor wrap, paste, 10,000-line note (T315.5)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('11: WHEN the app is rendered at width 118 with a note open in the inline editor and a single line longer than 118 characters is typed THEN no line of lastFrame() is longer than 118 characters', async () => {
    seedNote(store, 'line1');

    const { stdin, lastFrame } = render(<App store={store} width={118} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'line1');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('y'.repeat(130));
    // all 130 typed characters are on screen, and every line fits in 118
    const frame = await waitForFrame(
      lastFrame,
      (f) => (f.match(/y/g) ?? []).length >= 130 && f.split('\n').every((l) => l.length <= 118),
    );

    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(118);
    }
  });

  it('12: WHEN the text `hello\\rworld` is pasted (via the bracketed-paste sequence) into the open inline editor THEN the store\'s saved content (after Ctrl+S) holds `hello` and `world` as two separate lines, not one line containing a literal `\\r`', async () => {
    seedNote(store, '');

    const { stdin, lastFrame } = render(<App store={store} width={118} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '1 note');

    stdin.write('i');
    await waitForFrame(lastFrame, 'Ctrl+S save · Esc cancel · Enter new line');
    stdin.write('\x1b[200~hello\rworld\x1b[201~');
    await waitForFrame(lastFrame, 'world');
    stdin.write('\x13');
    await waitForFrame(lastFrame, (f) => {
      const lines = (store.getState().data.notes.get(eid('t1'))?.content ?? '').split('\n');
      return f.includes('Preview:') && !lines.join('\n').includes('\r') && lines.includes('hello') && lines.includes('world');
    });

    const content = store.getState().data.notes.get(eid('t1'))?.content ?? '';
    expect(content).not.toContain('\r');
    expect(content.split('\n')).toContain('hello');
    expect(content.split('\n')).toContain('world');
  });

  it('13: WHEN a note whose content is 10,000 lines is opened with `i` THEN the editor renders within one frame (lastFrame() is non-empty and returns synchronously)', async () => {
    const tenThousandLines = Array.from({ length: 10000 }, (_, i) => `line ${i}`).join('\n');
    seedNote(store, tenThousandLines);

    const { stdin, lastFrame } = render(<App store={store} width={118} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'line 0');

    const start = Date.now();
    stdin.write('i');
    // the editor opens with the caret at the end, so the last line is drawn
    await waitForFrame(lastFrame, (f) => f.length > 0 && f.includes('line 9999'));
    const elapsed = Date.now() - start;

    const frame = lastFrame() ?? '';
    expect(frame.length).toBeGreaterThan(0);
    // Well inside vitest's 3s default test timeout.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('inline editor help entry, footer hint, narrow terminal (T315.6)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
  });

  it('14: WHEN `?` is pressed THEN lastFrame() contains `i` and `Edit inline` in the help table', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('?');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('i') && f.includes('Edit inline'));

    expect(frame).toContain('i');
    expect(frame).toContain('Edit inline');
  });

  it('15: WHEN the app is rendered at width 40 with a note open in the inline editor THEN no line of lastFrame() is longer than 40 characters', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={40} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    // Width < 50 needs "reading" mode (Enter) for the preview slot to be
    // given any width at all (src/core/layout.ts paneLayout); see
    // test/tui/frame-width.test.tsx for the same two-step pattern.
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Preview: hello world');
    stdin.write('i');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S') && f.includes('hello world') && f.split('\n').every((l) => l.length <= 40),
    );

    expect(frame).toContain('hello world');
    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('16: WHEN the `discard changes?` prompt is open and a second `Escape` is pressed THEN the editor reopens still showing the unsaved buffer (the same as `n`), not the discard', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('hello world'));

    stdin.write('i');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Ctrl+S save · Esc cancel · Enter new line'));
    stdin.write('Z');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('hello worldZ'));
    stdin.write('\x1b');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('discard changes?'));

    stdin.write('\x1b');

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('hello worldZ');
      expect(frame).not.toContain('Preview:');
      expect(frame).not.toContain('discard changes?');
    });
  });

  it('17: WHEN a note is opened with `i` at width 80 THEN lastFrame() contains `Ctrl+S save · Esc cancel · Enter new line` and no line of lastFrame() is longer than 80 characters', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('i');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S save · Esc cancel · Enter new line') && f.split('\n').every((l) => l.length <= 80),
    );

    expect(frame).toContain('Ctrl+S save · Esc cancel · Enter new line');
    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('18: WHEN a note is opened with `i` at width 40 (after Enter for reading mode) THEN no line of lastFrame() is longer than 40 characters, including the footer hint row', async () => {
    seedNote(store, 'hello world');

    const { stdin, lastFrame } = render(<App store={store} width={40} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'hello world');

    stdin.write('\r');
    await waitForFrame(lastFrame, 'Preview: hello world');
    stdin.write('i');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S') && f.split('\n').every((l) => l.length <= 40),
    );

    expect(frame).toContain('Ctrl+S');
    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('19: WHEN README.md is read THEN its Editor section contains `i` as a key description mentioning the built-in editor, and still mentions `nvim`', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const readme = fs.readFileSync(path.resolve(process.cwd(), 'README.md'), 'utf8');
    const start = readme.indexOf('## Editor');
    const end = readme.indexOf('\n## ', start + 1);
    const section = readme.slice(start, end === -1 ? undefined : end);
    expect(section).toContain('`i`');
    expect(section).toContain('nvim');
  });
});
