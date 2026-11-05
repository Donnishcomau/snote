/**
 * #618 (lane 4c): with SNOTE_NEW_NOTE_EDITOR=inline, `n` writes the new note in the built-in inline editor; no note
 * exists before the first store that holds text; anything else (unset, `external`, an unknown value) and a window too
 * narrow for the preview pane keep the external editor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { saveInlineSession, finishInlineNew } from '../../src/tui/inline-new-note';
import { editNote } from '@vendor/state/data/actions';
import type { InlineSession } from '../../src/tui/inline-editor-state';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const FOOTER = 'Autosaves · Esc close · Ctrl+S save now';
const ESC = '\x1b';
const CTRL_S = '\x13';
const BACKSPACE = '\x7f';
const CURSOR = '\x1b[7m \x1b[27m'; // react-ink-textarea draws its caret as this raw inverse cell (not chalk), so the frame shows where it is

type StoreT = ReturnType<typeof makeStore>;
const contents = (store: StoreT): string[] => [...store.getState().data.notes.values()].map((n) => n.content ?? '');

async function start(store: StoreT, width = 80, runEditor?: (s: string) => Promise<string | null>) {
  const r = render(<App store={store} width={width} height={24} runEditor={runEditor} />);
  await waitForInput(r.stdin);
  return r;
}

describe('#618 4c: the inline route for a new note (SNOTE_NEW_NOTE_EDITOR=inline)', () => {
  let store: StoreT;
  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    vi.stubEnv('SNOTE_NEW_NOTE_EDITOR', 'inline');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('1: WHEN `n` is pressed, `hi` typed and Esc pressed THEN the inline editor opened with no external editor call, the store holds exactly one note `hi` and the notice says `New note saved`', async () => {
    const editor = vi.fn().mockResolvedValue('external text');
    const { stdin, lastFrame } = await start(store, 80, editor);
    stdin.write('n');
    await waitForFrame(lastFrame, FOOTER);
    expect(contents(store)).toEqual([]);
    stdin.write('hi');
    await waitForFrame(lastFrame, 'hi');
    stdin.write(ESC);
    await waitForFrame(lastFrame, (f) => f.includes('New note saved') && contents(store).join('|') === 'hi');
    expect(editor).not.toHaveBeenCalled();
    expect(contents(store)).toEqual(['hi']);
  });

  it('2: WHEN `n` is pressed and Esc pressed at once, and again after typing only a space and a newline, THEN each time the store holds no note and the notice says `Nothing typed, so no note was created`', async () => {
    const { stdin, lastFrame } = await start(store);
    stdin.write('n');
    await waitForFrame(lastFrame, FOOTER);
    stdin.write(ESC);
    await waitForFrame(lastFrame, 'Nothing typed, so no note was created');
    expect(contents(store)).toEqual([]);
    stdin.write('n');
    await waitForFrame(lastFrame, FOOTER);
    stdin.write(' ');
    await waitForFrame(lastFrame, `│ ${CURSOR}`); // the space is in the buffer: the caret sits one cell after it
    stdin.write('\r');
    await waitForFrame(lastFrame, (f) => (f.split('\n')[1] ?? '').endsWith(`│${CURSOR}`)); // the newline is in the buffer: the caret is on the editor's second row
    stdin.write(CTRL_S);
    await waitForFrame(lastFrame, 'Nothing typed, so no note was created');
    expect(contents(store)).toEqual([]);
  });

  it('3: WHEN `n`, `x` are typed, the autosave stores the note, Backspace empties it and Esc closes THEN the note is in the trash (deleted) and the notice says `Empty note moved to trash`', async () => {
    const { stdin, lastFrame } = await start(store);
    stdin.write('n');
    await waitForFrame(lastFrame, FOOTER);
    stdin.write('x');
    await vi.waitFor(() => expect(contents(store)).toEqual(['x']), { timeout: 2500, interval: 25 }); // the autosave timer stores it
    stdin.write(BACKSPACE);
    await waitForFrame(lastFrame, (f) => f.includes(`│${CURSOR}`) && !f.includes('│x')); // the x is gone from the editor row
    stdin.write(ESC);
    await waitForFrame(lastFrame, 'Empty note moved to trash');
    const notes = [...store.getState().data.notes.values()];
    expect(notes).toHaveLength(1);
    expect(notes[0].deleted).toBe(true);
  }, 8000);

  it('4: WHEN SNOTE_NEW_NOTE_EDITOR is `external`, `bogus` or empty THEN `n` calls the external editor and the inline footer never shows', async () => {
    for (const value of ['external', 'bogus', '']) {
      vi.stubEnv('SNOTE_NEW_NOTE_EDITOR', value);
      const editor = vi.fn().mockResolvedValue(null);
      const { stdin, lastFrame, unmount } = await start(makeStore({ stubClient: {} }), 80, editor);
      stdin.write('n');
      await vi.waitFor(() => expect(editor).toHaveBeenCalledTimes(1));
      expect(lastFrame() ?? '').not.toContain(FOOTER);
      unmount();
    }
  });

  it('5: WHEN the window is 40 columns wide (no preview pane) and `n` is pressed THEN the external editor is called and the inline footer does not show', async () => {
    const editor = vi.fn().mockResolvedValue(null);
    const { stdin, lastFrame } = await start(store, 40, editor);
    stdin.write('n');
    await vi.waitFor(() => expect(editor).toHaveBeenCalledTimes(1));
    expect(lastFrame() ?? '').not.toContain(FOOTER);
  });

  it('6: (#690) WHEN the first stored text of a new note holds a lone surrogate half (`a\\uD800`, which the store writes as `a\\uFFFD`) and one more store follows (`a\\uD800b`) THEN CREATE_NOTE_WITH_ID is dispatched `1` time, the session holds the note with stored `a\\uFFFD` after the first store, the store holds `1` note `a\\uFFFDb`, and the close says `New note saved`, not `Nothing typed`', () => {
    const creates: string[] = [];
    const dispatch = store.dispatch;
    store.dispatch = ((action: { type: string }) => { if (action.type === 'CREATE_NOTE_WITH_ID') creates.push(action.type); return dispatch(action as never); }) as typeof store.dispatch;
    const session: { current: InlineSession } = { current: { entry: null, stored: '', fresh: { id: 'f375-note' as never, top: null } } };
    const onEditorError = vi.fn();
    saveInlineSession({ store, session, local: 'a\uD800', onEditorError });
    expect(session.current.entry?.id).toBe('f375-note');
    expect(session.current.stored).toBe('a\uFFFD');
    saveInlineSession({ store, session, local: 'a\uD800b', onEditorError });
    expect(creates).toHaveLength(1);
    expect(contents(store)).toEqual(['a\uFFFDb']);
    const notices: string[] = [];
    finishInlineNew({ store, session, setNotice: (m) => notices.push(m), setNoticeError: (m) => notices.push(m) });
    expect(notices).toEqual(['New note saved — press g to add tags']);
    expect(onEditorError).not.toHaveBeenCalled();
  });

  it('7: (#701,) WHEN an `i` session on the note `x` stores `xa\\uD800`, `xa\\uD800b` and `xa\\uD800bc` (a lone surrogate half, which the store writes as U+FFFD) THEN the store holds `1` note `xa\\uFFFDbc`, it has no `conflicting change from another device` line and no merge error is shown', () => {
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'f377-note', note: { content: 'x', systemTags: [], tags: [] } } as never);
    const note = store.getState().data.notes.get('f377-note' as never)!;
    const session: { current: InlineSession } = { current: { entry: { id: 'f377-note' as never, note }, stored: 'x', fresh: null } };
    const onEditorError = vi.fn();
    for (const local of ['xa\uD800', 'xa\uD800b', 'xa\uD800bc']) saveInlineSession({ store, session, local, onEditorError });
    expect(contents(store)).toEqual(['xa\uFFFDbc']);
    expect(contents(store)[0]).not.toContain('conflicting change from another device');
    expect(onEditorError).not.toHaveBeenCalled();
  });

  it('8: (#701 keep-green) WHEN an `i` session on the note `alpha` stores `alpha X`, then another device makes it `R alpha X`, then the session stores `alpha X c` (both versions kept) and then `alpha X cd` THEN the store holds `1` note that still holds the other device\'s `R alpha X` and the typed `alpha X cd` (nothing lost)', () => {
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'f377-keep', note: { content: 'alpha', systemTags: [], tags: [] } } as never);
    const note = store.getState().data.notes.get('f377-keep' as never)!;
    const session: { current: InlineSession } = { current: { entry: { id: 'f377-keep' as never, note }, stored: 'alpha', fresh: null } };
    const onEditorError = vi.fn();
    saveInlineSession({ store, session, local: 'alpha X', onEditorError });
    store.dispatch(editNote('f377-keep' as never, { content: 'R alpha X' }));
    saveInlineSession({ store, session, local: 'alpha X c', onEditorError });
    saveInlineSession({ store, session, local: 'alpha X cd', onEditorError });
    expect(contents(store)).toHaveLength(1);
    expect(contents(store)[0]).toContain('R alpha X');
    expect(contents(store)[0]).toContain('alpha X cd');
  });
});
