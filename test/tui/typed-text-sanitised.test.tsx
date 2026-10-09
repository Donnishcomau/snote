/**
 * T507 (F151): pasted text in the search line, the tag editor and Prompt is
 * drawn through sanitizeForTerminal; the typed text itself stays as typed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { TagEditor } from '../../src/tui/TagEditor';
import { Prompt } from '../../src/tui/Prompt';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const eid = (id: string): EntityId => id as unknown as EntityId;

const RAW = 'abcd\x1b[45mef‮g';
const PASTE = '\x1b[200~' + RAW + '\x1b[201~';
const OSC_RAW = 'ab\x1b]52;c;QQ\x07cd\x9d52;c;QQ\x9c\x1b[45mef‮g';

function makeTwo(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('g'),
    note: makeNote('g', 'Groceries\n- [ ] milk', { modificationDate: 2000, creationDate: 2000 }),
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('h'),
    note: makeNote('h', 'Second', { modificationDate: 1000, creationDate: 1000 }),
  });
  return store;
}

async function openApp() {
  const store = makeTwo();
  const r = render(<App store={store} width={100} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, '>Groceries');
  return { store, ...r };
}

describe('typed and pasted text is drawn sanitised (T507)', () => {
  it('1: WHEN the notes `Groceries` and `Second` are shown, `/` is written and then `\\x1b[200~abcd\\x1b[45mef‮g\\x1b[201~` THEN the frame contains `search: abcdefg` and contains neither `\\x1b[45m` nor `‮`', async () => {
    const { stdin, lastFrame } = await openApp();
    expect(lastFrame()).toContain('Second');
    stdin.write('/');
    await waitForFrame(lastFrame, 'search:');
    stdin.write(PASTE);
    await waitForFrame(
      lastFrame,
      (f) => f.includes('search: abcdefg') && !f.includes('\x1b[45m') && !f.includes('‮'),
    );
  });

  it('2: WHEN the same paste is written into the search line THEN `store.getState().ui.searchQuery` is exactly `abcd\\x1b[45mef‮g`', async () => {
    const { store, stdin, lastFrame } = await openApp();
    stdin.write('/');
    await waitForFrame(lastFrame, 'search:');
    stdin.write(PASTE);
    await waitForFrame(
      lastFrame,
      (f) => f.includes('search: abcdefg') && store.getState().ui.searchQuery === RAW,
    );
    expect(store.getState().ui.searchQuery).toBe('abcd\x1b[45mef‮g');
  });

  it('3: WHEN `/` is written and then `\\x1b[200~ab\\x1b]52;c;QQ\\x07cd\\x9d52;c;QQ\\x9c\\x1b[45mef‮g\\x1b[201~` THEN the frame contains `search: abcd52;c;QQefg` and contains none of `\\x1b]52`, `\\x07`, `\\x9d`, `‮`', async () => {
    const { stdin, lastFrame } = await openApp();
    stdin.write('/');
    await waitForFrame(lastFrame, 'search:');
    stdin.write('\x1b[200~' + OSC_RAW + '\x1b[201~');
    await waitForFrame(
      lastFrame,
      (f) =>
        f.includes('search: abcd52;c;QQefg') &&
        !f.includes('\x1b]52') &&
        !f.includes('\x07') &&
        !f.includes('\x9d') &&
        !f.includes('‮'),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('search: abcd52;c;QQefg');
    expect(frame).not.toContain('\x1b]52');
    expect(frame).not.toContain('\x07');
    expect(frame).not.toContain('\x9d');
    expect(frame).not.toContain('‮');
  });

  it('4: WHEN `g` opens the tag editor on the note `Groceries` and the line-1 paste is written THEN the frame contains `tags: + abcdefg` and contains neither `\\x1b[45m` nor `‮`', async () => {
    const { stdin, lastFrame } = await openApp();
    stdin.write('g');
    await waitForFrame(lastFrame, 'tags:');
    stdin.write(PASTE);
    await waitForFrame(
      lastFrame,
      (f) => f.includes('tags: + abcdefg') && !f.includes('\x1b[45m') && !f.includes('‮'),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('tags: + abcdefg');
    expect(frame).not.toContain('\x1b[45m');
    expect(frame).not.toContain('‮');
  });

  it('5: WHEN a `TagEditor` (`tags=[]`, `onAdd` spy) gets that paste and then `\\r` THEN `onAdd` was called exactly `1` time with `abcd\\x1b[45mef‮g`', async () => {
    const onAdd = vi.fn();
    const { stdin, lastFrame } = render(
      <TagEditor tags={[]} allTags={[]} onAdd={onAdd} onRemove={vi.fn()} onClose={vi.fn()} />,
    );
    await waitForInput(stdin);
    stdin.write(PASTE);
    await waitForFrame(lastFrame, 'tags: + abcdefg');
    stdin.write('\r');
    await vi.waitFor(
      () => {
        expect(onAdd).toHaveBeenCalledTimes(1);
        expect(onAdd).toHaveBeenCalledWith('abcd\x1b[45mef‮g');
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it('6: WHEN `<Prompt label="rename tag" initial="" ...>` gets that paste THEN the frame contains `rename tag: abcdefg` and neither `\\x1b[45m` nor `‮`; WHEN `\\r` follows THEN `onSubmit` was called exactly `1` time with `abcd\\x1b[45mef‮g`', async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <Prompt label="rename tag" initial="" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    await waitForInput(stdin);
    stdin.write(PASTE);
    await waitForFrame(
      lastFrame,
      (f) => f.includes('rename tag: abcdefg') && !f.includes('\x1b[45m') && !f.includes('‮'),
    );
    stdin.write('\r');
    await vi.waitFor(
      () => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith('abcd\x1b[45mef‮g');
      },
      { timeout: 2000, interval: 10 },
    );
  });
});
