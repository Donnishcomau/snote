/**
 * #387: the inline editor stores its text as an ordinary note edit 1.5 s
 * after the last key (and at least every 5 s while typing), Esc closes and
 * keeps the text, and every store goes through saveInlineEdit into the note
 * selected when `i` was pressed. Each `stdin.write` below is one read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { readFileSync } from 'node:fs';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { HOSTILE } from '../fixtures/hostile';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const FOOTER = 'Autosaves · Esc close · Ctrl+S save now';
const CONFLICT = '--- conflicting change from another device ---';
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

type Store = ReturnType<typeof makeStore>;

function seed(store: Store, id: string, content: string, modificationDate: number): void {
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid(id),
    note: { content, systemTags: [], tags: [], deleted: false, modificationDate, creationDate: 1000 },
  });
}

const contentOf = (store: Store, id: string) => store.getState().data.notes.get(eid(id))?.content;

/** Every distinct content t<id> takes from now on, in order. */
function changesOf(store: Store, id: string): string[] {
  const seen: string[] = [];
  let prev = contentOf(store, id);
  unsubs.push(
    store.subscribe(() => {
      const now = contentOf(store, id);
      if (now !== prev) seen.push(now ?? '');
      prev = now;
    }),
  );
  return seen;
}

const unsubs: (() => void)[] = [];
const unmounts: (() => void)[] = [];
const until = (at: number) => new Promise((r) => setTimeout(r, Math.max(0, at - Date.now())));

async function app(store: Store, width = 80) {
  const r = render(<App store={store} width={width} height={24} />);
  unmounts.push(r.unmount);
  await waitForInput(r.stdin);
  return r;
}

async function openT1(content: string) {
  const store = makeStore({ stubClient: {} });
  seed(store, 't1', content, 2000);
  const r = await app(store);
  await waitForFrame(r.lastFrame, content.split('\n')[0]);
  const changes = changesOf(store, 't1');
  r.stdin.write('i');
  await waitForFrame(r.lastFrame, FOOTER);
  return { ...r, store, changes };
}

describe('#387 inline autosave', () => {
  beforeEach(() => {
    unsubs.splice(0);
  });
  afterEach(() => {
    for (const u of unsubs.splice(0)) u();
    for (const u of unmounts.splice(0)) u();
  });

  it('1: WHEN note t1 `hello world` is opened with `i` at width `80` and `Z` is written THEN the frame that first shows `hello worldZ` comes while t1 still holds `hello world`, and within 3000 ms t1 holds `hello worldZ` while the frame still shows `Autosaves · Esc close · Ctrl+S save now`', async () => {
    const { stdin, lastFrame, store } = await openT1('hello world');
    let atFirst: string | undefined;
    stdin.write('Z');
    await waitForFrame(lastFrame, (f) => {
      if (!f.includes('hello worldZ')) return false;
      atFirst ??= contentOf(store, 't1');
      return atFirst === 'hello world';
    });
    expect(atFirst).toBe('hello world');
    const frame = await waitForFrame(lastFrame, (f) => contentOf(store, 't1') === 'hello worldZ' && f.includes(FOOTER), 3000);
    expect(contentOf(store, 't1')).toBe('hello worldZ');
    expect(frame).toContain('Autosaves · Esc close · Ctrl+S save now');
  }, 10000);

  it('2: WHEN t1 `hello world` is open and the 16 keys `a` to `p` are written one every 400 ms THEN t1 is still `hello world` after the third key is shown, t1 changes at least once before `p` is written, and 2000 ms after `p` t1 is `hello worldabcdefghijklmnop`, having changed at least `2` and at most `3` times', async () => {
    const { stdin, lastFrame, store, changes } = await openT1('hello world');
    const keys = 'abcdefghijklmnop';
    const t0 = Date.now();
    let afterThird: string | undefined;
    let beforeP = -1;
    for (let k = 0; k < keys.length; k++) {
      await until(t0 + 400 * k);
      if (k === 15) beforeP = changes.length;
      stdin.write(keys[k]);
      await waitForFrame(lastFrame, `hello world${keys.slice(0, k + 1)}`);
      if (k === 2) afterThird = contentOf(store, 't1');
    }
    expect(afterThird).toBe('hello world');
    expect(beforeP).toBeGreaterThanOrEqual(1);
    await waitForFrame(
      lastFrame,
      () => contentOf(store, 't1') === 'hello worldabcdefghijklmnop' && changes.length >= 2 && changes.length <= 3,
      2000,
    );
    expect(contentOf(store, 't1')).toBe('hello worldabcdefghijklmnop');
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.length).toBeLessThanOrEqual(3);
  }, 15000);

  it('3: WHEN t1 `hello world` is open, `Z` is written and Escape follows at once THEN the frame shows `Preview:` and never `discard changes?`, t1 is `hello worldZ` and changed exactly `1` time; and WHEN a fresh App opens t1 and Escape is pressed with nothing typed THEN `data.notes` is the same Map object (`toBe`) as before `i`', async () => {
    const { stdin, lastFrame, frames, store, changes } = await openT1('hello world');
    stdin.write('Z');
    stdin.write('\x1b');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && contentOf(store, 't1') === 'hello worldZ' && changes.length === 1 && !frames.some((x) => x.includes('discard changes?')),
    );
    expect(lastFrame()).toContain('Preview:');
    expect(frames.some((x) => x.includes('discard changes?'))).toBe(false);
    expect(contentOf(store, 't1')).toBe('hello worldZ');
    expect(changes.length).toBe(1);

    const fresh = makeStore({ stubClient: {} });
    seed(fresh, 't1', 'hello world', 2000);
    const r = await app(fresh);
    await waitForFrame(r.lastFrame, 'hello world');
    const before = fresh.getState().data.notes;
    r.stdin.write('i');
    await waitForFrame(r.lastFrame, FOOTER);
    r.stdin.write('\x1b');
    await waitForFrame(r.lastFrame, (f) => f.includes('Preview:') && fresh.getState().data.notes === before);
    expect(fresh.getState().data.notes).toBe(before);
  });

  it('4: WHEN t1 `hello world` is open, `Z` is written and stored by the timer, then `Y` is written and Ctrl+S (`\\x13`) pressed THEN the frame shows `Preview:` and t1 is exactly `hello worldZY` (no `--- conflicting change from another device ---` block)', async () => {
    const { stdin, lastFrame, store } = await openT1('hello world');
    stdin.write('Z');
    await waitForFrame(lastFrame, (f) => f.includes('hello worldZ') && f.includes(FOOTER) && contentOf(store, 't1') === 'hello worldZ', 3000);
    stdin.write('Y');
    await waitForFrame(lastFrame, 'hello worldZY');
    stdin.write('\x13');
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && contentOf(store, 't1') === 'hello worldZY');
    expect(lastFrame()).toContain('Preview:');
    expect(contentOf(store, 't1')).toBe('hello worldZY');
    expect(contentOf(store, 't1')).not.toContain(CONFLICT);
  }, 10000);

  it('5: WHEN t1 `one alpha` (newer) and t2 `alpha two` are shown, the search `alpha` is applied, t1 is opened with `i`, 5 Backspaces and `X` are written and stored, then `Y` is written and stored THEN t1 is `one XY` and t2 is the same note object (`toBe`) with content `alpha two`', async () => {
    const store = makeStore({ stubClient: {} });
    seed(store, 't1', 'one alpha', 3000);
    seed(store, 't2', 'alpha two', 2000);
    const t2 = store.getState().data.notes.get(eid('t2'));
    const { stdin, lastFrame } = await app(store);
    await waitForFrame(lastFrame, (f) => f.includes('one alpha') && f.includes('alpha two'));
    stdin.write('/');
    await waitForFrame(lastFrame, 'search:');
    for (const ch of 'alpha') stdin.write(ch);
    await waitForFrame(lastFrame, 'search: alpha');
    stdin.write('\r');
    await waitForFrame(lastFrame, (f) => f.includes('Preview: one alpha') && f.includes('search: alpha'));
    stdin.write('i');
    await waitForFrame(lastFrame, FOOTER);
    for (let i = 0; i < 5; i++) stdin.write('\x7F');
    stdin.write('X');
    await waitForFrame(lastFrame, (f) => f.includes('one X') && contentOf(store, 't1') === 'one X', 3000);
    stdin.write('Y');
    await waitForFrame(lastFrame, (f) => f.includes('one XY') && contentOf(store, 't1') === 'one XY', 3000);
    expect(contentOf(store, 't1')).toBe('one XY');
    expect(store.getState().data.notes.get(eid('t2'))).toBe(t2);
    expect(contentOf(store, 't2')).toBe('alpha two');
  }, 10000);

  it('6: WHEN t1 `one\\ntwo` is open, `A` is written and stored, then a remote EDIT_NOTE sets t1 to `REMOTE\\none\\ntwoA`, then `B` is written and stored, then `C` is written and Escape pressed THEN t1 is exactly `REMOTE\\none\\ntwoABC` and the frame never shows `could not be merged`', async () => {
    const { stdin, lastFrame, frames, store } = await openT1('one\ntwo');
    stdin.write('A');
    await waitForFrame(lastFrame, (f) => f.includes('twoA') && contentOf(store, 't1') === 'one\ntwoA', 3000);
    store.dispatch({ type: 'EDIT_NOTE', noteId: eid('t1'), changes: { content: 'REMOTE\none\ntwoA' } } as never);
    stdin.write('B');
    await waitForFrame(lastFrame, (f) => f.includes('twoAB') && contentOf(store, 't1') === 'REMOTE\none\ntwoAB', 3000);
    stdin.write('C');
    await waitForFrame(lastFrame, 'twoABC');
    stdin.write('\x1b');
    await waitForFrame(
      lastFrame,
      (f) => f.includes('Preview:') && contentOf(store, 't1') === 'REMOTE\none\ntwoABC' && !frames.some((x) => x.includes('could not be merged')),
    );
    expect(contentOf(store, 't1')).toBe('REMOTE\none\ntwoABC');
    expect(frames.some((x) => x.includes('could not be merged'))).toBe(false);
  }, 10000);

  it('9: WHEN `A`, HOSTILE.osc52Bel (test/fixtures/hostile.ts), `B`, `‮`, `D`, a lone `\\ud83d` and `E` are pasted in one bracketed paste into t1 `hello world` and stored by the timer THEN t1 equals what Ctrl+S stores for the same paste in a second fresh App, holds `�` and no lone half, and no frame contains `\\x1b]52`', async () => {
    const paste = `\x1b[200~A${HOSTILE.osc52Bel}B\u202eD\ud83dE\x1b[201~`;
    const viaSave = await openT1('hello world');
    viaSave.stdin.write(paste);
    await waitForFrame(viaSave.lastFrame, 'hello worldA');
    viaSave.stdin.write('\x13');
    await waitForFrame(viaSave.lastFrame, (f) => f.includes('Preview:') && contentOf(viaSave.store, 't1') !== 'hello world');
    const saved = contentOf(viaSave.store, 't1');

    const timed = await openT1('hello world');
    timed.stdin.write(paste);
    await waitForFrame(timed.lastFrame, (f) => f.includes(FOOTER) && contentOf(timed.store, 't1') === saved, 3000);
    const stored = contentOf(timed.store, 't1') ?? '';
    expect(stored).toBe(saved);
    expect(stored).toContain('�');
    expect(LONE.test(stored)).toBe(false);
    expect([...viaSave.frames, ...timed.frames].some((f) => f.includes('\x1b]52'))).toBe(false);
  }, 10000);

  it('10: WHEN README.md is read THEN `split(\'\\n\').length` is `199`, it contains `it saves as you type` and `` `Esc` closes and keeps your text `` exactly once, and it no longer contains `it asks first if you have unsaved changes`', () => {
    const readme = readFileSync('README.md', 'utf8');
    const count = (s: string) => readme.split(s).length - 1;
    expect(readme.split('\n').length).toBe(199);
    expect(count('it saves as you type')).toBe(1);
    expect(count('`Esc` closes and keeps your text')).toBe(1);
    expect(readme).not.toContain('it asks first if you have unsaved changes');
  });

  it('11: WHEN t1 `one` (newer) and t2 `two` are shown, t1 is opened with `i`, `Q` is written and Escape pressed at once, Down (`\\x1b[B`) selects t2 and t2 is opened with `i` at once (all within 1500 ms of `Q`), and then 6000 ms pass with nothing typed THEN t1 is `oneQ` and changed exactly `1` time, and t2 is the same note object (`toBe`) with content `two`', async () => {
    const store = makeStore({ stubClient: {} });
    seed(store, 't1', 'one', 3000);
    seed(store, 't2', 'two', 2000);
    const t2 = store.getState().data.notes.get(eid('t2'));
    const { stdin, lastFrame } = await app(store);
    await waitForFrame(lastFrame, (f) => f.includes('one') && f.includes('two'));
    const changes = changesOf(store, 't1');
    stdin.write('i');
    await waitForFrame(lastFrame, FOOTER);
    const q = Date.now();
    stdin.write('Q');
    stdin.write('\x1b');
    await waitForFrame(lastFrame, (f) => f.includes('Preview:') && contentOf(store, 't1') === 'oneQ');
    stdin.write('\x1b[B');
    await waitForFrame(lastFrame, 'Preview: two');
    stdin.write('i');
    await waitForFrame(lastFrame, (f) => f.includes(FOOTER) && !f.includes('Preview:'));
    expect(Date.now() - q).toBeLessThan(1500);
    await until(Date.now() + 6000);
    expect(contentOf(store, 't1')).toBe('oneQ');
    expect(changes.length).toBe(1);
    expect(store.getState().data.notes.get(eid('t2'))).toBe(t2);
    expect(contentOf(store, 't2')).toBe('two');
  }, 15000);
});
