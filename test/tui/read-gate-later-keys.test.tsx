/**
 * T538R-3 (F217, F220): the per-read rule in the list, search and the editor.
 *
 * Only the first key of one stdin read acts outside text entry; every later
 * key and paste of the read goes to the text-entry mode the earlier keys
 * opened, the read ends at the key that closes that mode, and the rest is
 * dropped with the status line `Several keys at once: only the first was
 * used`. Ink's delayed lone escape belongs to the read it came from. Each
 * `stdin.write` below is one read. A later key or paste of a read never answers
 * a y/n confirm an earlier key opened (line 4).
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const SEVERAL = 'Several keys at once: only the first was used';
const ASK = 'log out and delete local data? y/n';

async function atList() {
  const store = makeStore({ stubClient: {} });
  const now = Date.now();
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content: 'hello world', systemTags: [], tags: [], deleted: false, modificationDate: now, creationDate: now },
  });
  const onLogout = vi.fn();
  const r = render(<App store={store} width={80} height={24} onLogout={onLogout} onQuit={vi.fn()} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'hello world');
  const t1 = () => store.getState().data.notes.get(eid('t1'));
  const query = () => store.getState().ui.searchQuery;
  const untouched = () => JSON.stringify(t1()?.systemTags) === '[]' && t1()?.deleted === false;
  return { ...r, t1, query, untouched, onLogout };
}

const settle = () => new Promise((res) => setTimeout(res, 100));

describe('T538R-3 later keys of one read', () => {
  it('1: WHEN the list shows note t1 `hello world` and `iPd` arrives as one read THEN the frame contains `Ctrl+S save` and `hello worldPd`, and t1 has system tags `[]` and deleted `false`', async () => {
    const a = await atList();
    a.stdin.write('iPd');
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes('Ctrl+S save') && f.includes('hello worldPd') && a.untouched());
    expect(frame).toContain('Ctrl+S save');
    expect(frame).toContain('hello worldPd');
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
  });

  it('2: WHEN the list shows note t1 and `pd` arrives as one read, then `p\x1b[200~xyz\x1b[201~` as one read THEN t1 has system tags `[]` and deleted `false`, and the frame contains `Several keys at once: only the first was used` and not `Paste ignored`', async () => {
    const a = await atList();
    a.stdin.write('pd');
    await waitForFrame(a.lastFrame, (f) => f.includes(SEVERAL) && JSON.stringify(a.t1()?.systemTags) === '["pinned"]');
    a.stdin.write('p\x1b[200~xyz\x1b[201~');
    await settle();
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes(SEVERAL) && !f.includes('Paste ignored') && a.untouched());
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
    expect(frame).toContain(SEVERAL);
    expect(frame).not.toContain('Paste ignored');
  });

  it('3: WHEN the list shows note t1 `hello world` and `iXYZ\x13\x1b[BPd` arrives as one read THEN t1 holds content `hello worldXYZ`, system tags `[]` and deleted `false`, and the frame contains `Several keys at once: only the first was used`', async () => {
    const a = await atList();
    a.stdin.write('iXYZ\x13\x1b[BPd');
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes(SEVERAL) && a.t1()?.content === 'hello worldXYZ' && a.untouched());
    expect(a.t1()?.content).toBe('hello worldXYZ');
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
    expect(frame).toContain(SEVERAL);
  });

  it('4: WHEN the list shows note t1 and `Ly`, `L\x1b[200~y\x1b[201~` or `L\x1b[By` arrives as one read (each in a fresh app) THEN `onLogout` is called 0 times and the frame contains `log out and delete local data? y/n`', async () => {
    for (const read of ['Ly', 'L\x1b[200~y\x1b[201~', 'L\x1b[By']) {
      const a = await atList();
      a.stdin.write(read);
      const frame = await waitForFrame(a.lastFrame, ASK);
      await settle();
      expect(a.onLogout).toHaveBeenCalledTimes(0);
      expect(frame).toContain(ASK);
      expect(a.lastFrame()).toContain(ASK);
      a.unmount();
    }
  });

  it('5: WHEN the list shows note t1 and `/\x1b[200~milk\x1b[201~\r\x1b[BPd` arrives as one read THEN the search query is `milk`, t1 has system tags `[]` and deleted `false`, and the frame contains `Several keys at once: only the first was used`', async () => {
    const a = await atList();
    a.stdin.write('/\x1b[200~milk\x1b[201~\r\x1b[BPd');
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes(SEVERAL) && a.query() === 'milk' && a.untouched());
    expect(a.query()).toBe('milk');
    expect(a.t1()?.systemTags).toEqual([]);
    expect(a.t1()?.deleted).toBe(false);
    expect(frame).toContain(SEVERAL);
  });

  it('6: WHEN the logout confirm shows and `y\\x1b` arrives as one read (Ink hands the trailing escape over later) THEN `onLogout` is called 0 times and the frame still contains `log out and delete local data? y/n`', async () => {
    const a = await atList();
    a.stdin.write('L');
    await waitForFrame(a.lastFrame, ASK);
    a.stdin.write('y\x1b');
    await settle();
    expect(a.onLogout).toHaveBeenCalledTimes(0);
    expect(a.lastFrame()).toContain(ASK);
  });
});
