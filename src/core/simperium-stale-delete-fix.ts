/**
 * T301 — a note deleted forever on the server while this client was
 * offline reappears after a full re-index.
 *
 * When a client reconnects with a change version the server no longer
 * recognises, `Channel.prototype.onChangeVersion`
 * (node_modules/simperium/lib/simperium/channel.js:717-724) resets the cv
 * and calls `startIndexing()` (channel.js:644-648). The index pages then
 * arrive in `Channel.prototype.onIndex` (channel.js:667-692), which only
 * calls `internal.updateObjectVersion` for the ids PRESENT in each page,
 * and `internal.indexingComplete` (channel.js:265-277) only saves the new
 * cv and emits `'index'` / `'ready'`. Neither ever diffs the completed
 * index against the ids the client already knows locally. The ONLY place
 * the channel emits `'remove'` is `internal.removeObject`
 * (channel.js:144-154), reached solely from `applyChange`'s REMOVE branch
 * (channel.js:225) during an incremental `onChanges` catch-up — so a note
 * removed on the server while this client was disconnected long enough to
 * fall out of the server's change history is never removed locally once
 * the client comes back via full re-index; it stays forever.
 *
 * This module reconciles a finished index against local state. Per
 * note-bucket channel: `'indexingStateChange'` (true)
 * (channel.js:450-453, fired by `startIndexing` before the first index
 * request) clears a Set of seen ids; every `'update'` emitted with
 * `isIndexing` true (channel.js:139, 5th arg) adds its id to the Set;
 * `'index'` (channel.js:273, fired once per completed re-index) diffs
 * `store.getState().data.notes` against the Set. Every local id NOT in
 * the Set was absent from the server's entire index — the server does not
 * have it — and gets
 * `store.dispatch({ type: 'REMOTE_NOTE_DELETE_FOREVER', noteId })`, the
 * same action the vendored middleware's `'remove'` listener dispatches
 * (vendor/simplenote/state/simperium/middleware.ts:117-121) and
 * `vendor/simplenote/state/data/reducer.ts:78-89` already handles.
 *
 * Two ids are never removed:
 * - ids the index itself just removed during this run (they are already
 *   gone from `data.notes`, so the diff skips them anyway), and
 * - ids in `store.getState().simperium.pendingNotes` (the same field
 *   `store.forceSync` reads, src/core/store.ts:194, populated before any
 *   index round-trip completes by `requeueUnsynced`'s `IMPORT_NOTE_WITH_ID`
 *   for notes newer than their ghost, T85). Those are local work the
 *   server has not confirmed yet — a fresh index says nothing about them,
 *   and deleting them would destroy an unsynced offline edit or create.
 *
 * The listener is attached with `on` (runs after the vendored listeners,
 * which were attached at construction), and re-indexes are idempotent:
 * the action is a no-op in the reducer for a note that is already gone.
 */

import type { Store } from 'redux';

import type * as A from '@vendor/state/action-types';
import type { State } from './store';

// OMARCHY: boundary cast — Channel is untyped where it reaches through
// the simperium client's `buckets`; only these members are touched.
interface ChannelLike {
  on(event: string, listener: (...args: never[]) => void): unknown;
  isIndexing?: boolean;
}

interface BucketLike {
  name?: string;
  channel?: ChannelLike;
}

interface ClientLike {
  buckets?: BucketLike[];
}

/**
 * Channels already wired in this process. `channel.on` is inherited from
 * `EventEmitter.prototype` — the SAME function object on every Channel —
 * so a flag written onto `channel.on` (or any prototype method) would
 * leak to every other channel in the process and make later installs
 * silently skip. The `channel` object itself is per-instance, which is
 * how `simperium-reconnect-fix.ts` stays instance-safe too.
 */
const installed = new WeakSet<object>();

/**
 * Reconcile one channel's completed index against local notes. Safe to
 * call more than once on the same channel; only the note bucket has its
 * channels wired (other buckets have no local diff target).
 */
function installOnChannel(
  channel: ChannelLike | undefined,
  store: Store<State, A.ActionType>
): void {
  if (!channel || typeof channel.on !== 'function') {
    return;
  }
  if (installed.has(channel)) {
    return;
  }
  installed.add(channel);

  // Ids the index pages carried during the re-index in flight: every
  // `'update'` emitted with `isIndexing` true (channel.js:139, fired by
  // `internal.updateObjectVersion` for each object in each page). The
  // diff is keyed on these because they are the only truth the channel
  // leaves behind: the index pages write ghosts into the CHANNEL's
  // ghost store (`store.put`), while the Redux ghost mirror
  // (`store.getState().simperium.ghosts`) stays empty after a re-index
  // (probe against the fake server, T301). An id the server deleted
  // while we were offline appears on no page, so no `'update'` ever
  // carries it.
  const seenDuringIndex = new Set<string>();

  // Reconcile only while the channel's local queue is still paused,
  // i.e. the re-index is still running. `indexingComplete`
  // (channel.js:265-277) pauses it first and only starts it in the
  // ghost-store `updateChangeVersion` promise callback, while `'index'`
  // is emitted synchronously before that callback, so the snapshot is
  // still the pre-ack one; once the queue has restarted, note acks have
  // already emptied `pendingNotes` and a re-diff would wrongly delete.
  const reconcile = (queuePaused: boolean) => {
    if (!queuePaused) {
      return;
    }
    // The index is complete: every id the server holds was seen. Local
    // ids it never carried are notes the server deleted forever while
    // we were offline — remove them. Notes with unsynced local work
    // (`pendingNotes`, set by `requeueUnsynced` before any index event
    // can fire) are spared: a fresh index says nothing about them.
    const { notes } = store.getState().data;
    const { pendingNotes } = store.getState().simperium;
    for (const id of notes.keys()) {
      if (seenDuringIndex.has(id) || id in pendingNotes) {
        continue;
      }
      store.dispatch({
        type: 'REMOTE_NOTE_DELETE_FOREVER',
        noteId: id,
      } as A.ActionType);
    }
  };

  channel.on('indexingStateChange', (isIndexing: boolean) => {
    if (isIndexing) {
      seenDuringIndex.clear();
    }
  });

  channel.on('update', (id: string, _data: unknown, _original: unknown, _patch: unknown, isIndexing: boolean) => {
    if (isIndexing && typeof id === 'string') {
      seenDuringIndex.add(id);
    }
  });

  channel.on('index', () => {
    // `'index'` (channel.js:273) fires once per completed re-index,
    // after every page's `'update'` has run, and it is emitted
    // synchronously last, so the vendored listeners are already done.
    // Diff against the snapshot taken during the run.
    reconcile(channel.isIndexing === false);
  });
}

/**
 * Hook every note-bucket channel of a simperium client so a completed
 * full re-index removes notes the server no longer has. Safe to call more
 * than once; never throws on a client without channels.
 */
export function installSimperiumStaleDeleteFix(
  client: unknown,
  store: Store<State, A.ActionType>
): void {
  // OMARCHY: boundary cast
  const withBuckets = (client ?? {}) as ClientLike;
  for (const bucket of withBuckets.buckets ?? []) {
    if (bucket?.name === 'note') {
      installOnChannel(bucket.channel, store);
    }
  }
}

export default installSimperiumStaleDeleteFix;
