/**
 * if the start-up hand-off throws (here the ghost read of n1 after the catch-up rejects), the
 * held ids it did not send still count as unsent: unsentCount, the status bar (`1 pending`, never
 * `synced`) and the logout typed confirm. An id whose hand-off completed before the throw is released
 * as before. The holds themselves are still released (, test/core/requeue-release-on-throw.test.ts).
 *
 * Rig: a connected stub store (`makeStore({ stubClient: {} })`, `green`) with notes n0 (`zero`) and n1
 * (`held`) put in by REMOTE_NOTE_UPDATE (nothing pending); the ghost reader answers `{}` until the
 * catch-up resolves, then rejects for n1 only with `ghost read failed`.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { EventEmitter } from 'node:events';

import { makeStore } from '../../src/core/store';
import { requeueUnsynced, type GhostReader } from '../../src/core/requeue';
import { isHeld, unsentCount } from '../../src/core/held-unsynced';
import { installSimperiumStaleDeleteFix } from '../../src/core/simperium-stale-delete-fix';
import { initialState, pendingCount } from '../../src/core/simperium-reducer';
import { App } from '../../src/tui/App';
import { makeNote } from '../tui/fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const TYPED = "log out: 1 unsynced change will be deleted. Please type 'logout' to confirm";

async function thrownHandOff(failId: string | null, tracking = false): Promise<ReturnType<typeof makeStore>> {
  const store = makeStore({ stubClient: {}, ...(tracking ? { preloadedState: { simperium: { ...initialState, tracking: true } } as never } : {}) });
  store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as never);
  for (const [id, text] of [['n0', 'zero'], ['n1', 'held']]) {
    store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: makeNote(id, text, { modificationDate: 2000 }) } as never);
  }
  let caughtUp = false;
  const ghosts: GhostReader = {
    get: (id) => (caughtUp && id === failId ? Promise.reject(new Error('ghost read failed')) : Promise.resolve({})),
  };
  const run = requeueUnsynced(store, ghosts, async () => {
    caughtUp = true;
  });
  if (failId) await expect(run).rejects.toThrow('ghost read failed');
  else await run;
  return store;
}

describe('a start-up hand-off that throws leaves its unsent edits counted', () => {
  it('1: WHEN the hand-off throws on n1 after n0 completed THEN unsentCount is `1`, pendingCount is `0` and isHeld(store, `n1`) is `false`', async () => {
    const store = await thrownHandOff('n1');
    expect(pendingCount(store.getState().simperium)).toBe(0);
    expect(isHeld(store, 'n1')).toBe(false);
    expect(unsentCount(store)).toBe(1);
  });

  it('2: WHEN the hand-off does not throw THEN unsentCount is `0`', async () => {
    const store = await thrownHandOff(null);
    expect(pendingCount(store.getState().simperium)).toBe(0);
    expect(unsentCount(store)).toBe(0);
  });

  it('3: WHEN line 1\'s store is shown THEN the App frame contains `1 pending` and does not contain `synced`', { timeout: 8000 }, async () => {
    const store = await thrownHandOff('n1');
    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('1 pending') && !f.includes('synced'));
    expect(frame).toContain('1 pending');
    expect(frame).not.toContain('synced');
    unmount();
  });

  it(`4: WHEN line 1's store is shown and \`L\` is written THEN the frame contains "${TYPED}" and does not contain "log out and delete local data?"`, { timeout: 8000 }, async () => {
    const store = await thrownHandOff('n1');
    const { stdin, lastFrame, unmount } = render(<App store={store} width={120} height={24} onLogout={() => {}} />);
    await waitForInput(stdin);
    stdin.write('L');
    const frame = await waitForFrame(lastFrame, (f) => f.includes("Please type 'logout' to confirm"));
    expect(frame.replace(/\s*\n\s*/g, ' ')).toContain(TYPED);
    expect(frame).not.toContain('log out and delete local data?');
    unmount();
  });

  it('5: WHEN after line 1 (pending tracked) a local edit of n1 is sent and the server confirms it and n0 THEN unsentCount is `0` and the App frame contains `synced`', { timeout: 8000 }, async () => {
    const store = await thrownHandOff('n1', true);
    store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: 'held 2' } } as never);
    expect(pendingCount(store.getState().simperium)).toBe(2); // n0 from its completed hand-off, n1 from the edit
    expect(unsentCount(store)).toBe(2);
    for (const id of ['n0', 'n1']) {
      store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: id } as never);
      store.dispatch({ type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: id } as never);
    }
    expect(pendingCount(store.getState().simperium)).toBe(0);
    expect(unsentCount(store)).toBe(0);
    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('synced') && !f.includes('1 pending'));
    expect(frame).toContain('synced');
    expect(frame).not.toContain('1 pending');
    unmount();
  });

  it('6: WHEN after line 1 another note arrives THEN unsentCount stays `1`; WHEN n1 is then deleted for good THEN unsentCount is `0`', async () => {
    const store = await thrownHandOff('n1');
    store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: 'n2', note: makeNote('n2', 'other', { modificationDate: 2000 }) } as never);
    expect(unsentCount(store)).toBe(1);
    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'n1' } as never);
    expect(store.getState().data.notes.has('n1' as never)).toBe(false);
    expect(unsentCount(store)).toBe(0);
  });

  it('7: WHEN after line 1 a completed re-index carries n0 and not n1 THEN n1 is still in the store, its ghost is kept and unsentCount stays `1`', async () => {
    const store = await thrownHandOff('n1');
    const removed: string[] = [];
    const channel = Object.assign(new EventEmitter(), { isIndexing: true, store: { remove: async (id: string) => removed.push(id) } });
    installSimperiumStaleDeleteFix({ buckets: [{ name: 'note', channel }] }, store as never);
    channel.emit('indexingStateChange', true);
    channel.emit('update', 'n0', {}, {}, null, true);
    channel.isIndexing = false;
    channel.emit('index');
    expect(store.getState().data.notes.has('n1' as never)).toBe(true);
    expect(removed).not.toContain('n1');
    expect(unsentCount(store)).toBe(1);
  });
});
