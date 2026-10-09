/**
 * T501 — notes held for the catch-up are released even when the hand-off
 * after the catch-up throws (F143, data-safety hardening from the T499
 * review).
 *
 * `requeueUnsynced` (src/core/requeue.ts) holds every unsynced note with
 * `holdId` while it waits for the catch-up and released the holds only at
 * the very end of the post-catch-up hand-off. If anything in that hand-off
 * throws — e.g. a ghost read after `await whenCaughtUp()` rejects — the
 * holds stayed for the whole session and a later re-index could never drop
 * those ids. Now the holds are released whether the hand-off finishes or
 * throws, and the error still reaches the caller.
 *
 * Rig: `makeStore({ stubClient: {} })` with note `n1` (content `held`,
 * modificationDate 2000) imported via `IMPORT_NOTE_WITH_ID`, plus a
 * hand-made GhostReader whose `get` returns `{}` until `whenCaughtUp` has
 * resolved and then rejects with `new Error('ghost read failed')`.
 */
import { makeStore } from '../../src/core/store';
import { requeueUnsynced, type GhostReader } from '../../src/core/requeue';
import { isHeld } from '../../src/core/held-unsynced';
import { makeNote } from '../tui/fixtures';

import type { Store } from 'redux';
import type { EntityId, Note } from '@vendor/types';
import type { State } from '../../src/core/store';
import type * as A from '@vendor/state/action-types';

const eid = (id: string): EntityId => id as unknown as EntityId;

/** A ghost reader: `{}` for every read until `release` flips it to rejecting. */
function ghostReader(rejectAfter: () => boolean): GhostReader {
  return {
    get(): Promise<{ data?: Partial<Note> }> {
      if (rejectAfter()) return Promise.reject(new Error('ghost read failed'));
      return Promise.resolve({});
    },
  };
}

function rig(): { store: Store<State, A.ActionType> } {
  const store = makeStore({ stubClient: {} });
  const note = makeNote('n1', 'held', { modificationDate: 2000 });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('n1'),
    note,
  } as A.ActionType);
  return { store };
}

describe('T501 holds release even when the post-catch-up hand-off throws', () => {
  it("1: WHEN requeueUnsynced runs with the rig whose ghost read after the catch-up rejects THEN it rejects with `ghost read failed` and afterwards `isHeld(store, 'n1')` is `false`", async () => {
    const { store } = rig();
    let caughtUp = false;
    const whenCaughtUp = async () => {
      caughtUp = true;
    };
    const ghosts = ghostReader(() => caughtUp);

    await expect(requeueUnsynced(store, ghosts, whenCaughtUp)).rejects.toThrow(
      'ghost read failed'
    );
    expect(isHeld(store, 'n1')).toBe(false);
  });

  it("2: WHEN the same rig's GhostReader never rejects THEN requeueUnsynced resolves and afterwards `isHeld(store, 'n1')` is `false`", async () => {
    const { store } = rig();
    let caughtUp = false;
    const whenCaughtUp = async () => {
      caughtUp = true;
    };
    const ghosts = ghostReader(() => false);

    await expect(requeueUnsynced(store, ghosts, whenCaughtUp)).resolves.toEqual(['n1']);
    expect(isHeld(store, 'n1')).toBe(false);
  });
});
