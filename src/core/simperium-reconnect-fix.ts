/**
 * T296 — a queued local edit can be lost for good on reconnect.
 *
 * On reconnect with a known change version, `Channel.prototype.onAuth`
 * (node_modules/simperium/lib/simperium/channel.js:609-637) calls
 * `localQueue.start()` (channel.js:627, flushing anything queued while
 * offline) and registers `once('ready', () => localQueue.resendSentChanges())`
 * (channel.js:622, resending anything that was in-flight before the
 * disconnect) BEFORE `sendChangeVersionRequest(cv)`'s catch-up reply can
 * arrive. `Channel.prototype.onChanges` (channel.js:702-714), which handles
 * that reply, queues each change with `networkQueue.queueFor(id).add(fn)`
 * — deferred via `setImmediate` (channel.js:769-789) — and then emits
 * `'ready'` SYNCHRONOUSLY, before any `fn` has run. Both resend paths can
 * therefore fire before `internal.updateObjectVersion` (channel.js:100-142,
 * the OT rebase) has processed a conflicting remote change; the stale-`sv`
 * resend then hits `handleChangeError`'s `CODE_INVALID_VERSION` /
 * `CODE_INVALID_DIFF` branch (channel.js:229-248) — a crude full-object
 * resend, not a rebase — which can lose the local edit.
 *
 * This module defers both flushes until the channel's network queue is
 * fully drained. `networkQueue.queueFor` (channel.js:842-855) is wrapped to
 * count outstanding per-object queues: +1 the first time an id's queue is
 * opened, −1 on that queue's `'finish'` event (the vendored listener that
 * evicts the queue from `queues` fires first, then ours). `localQueue.start`
 * and `localQueue.resendSentChanges` are wrapped to call the SAME original
 * immediately when the counter is `0` (a normal reconnect with nothing to
 * catch up on is untouched) or, when it is not `0`, exactly once later, when
 * the counter returns to `0` — by then any conflicting change has already
 * run `updateObjectVersion`'s `dequeueChangesFor` + requeue
 * (channel.js:122, 132-136), so the deferred resend sends the rebased
 * change, never the stale one. Nothing is dropped or duplicated: each
 * original is invoked exactly once on either path.
 *
 * The hooks are the INSTANCE properties (`channel.localQueue.start`,
 * `channel.localQueue.resendSentChanges`, `channel.networkQueue.queueFor`),
 * which the vendored code looks up fresh at call time (e.g.
 * `_this12.localQueue.start()`, channel.js:627) — unlike `onAuth` /
 * `onChanges`, which are bound once at construction (channel.js:390-392)
 * and are not interceptable after `new Channel(...)`.
 */

// Minimal shapes of the untyped vendored queue objects.
// OMARCHY: boundary cast — localQueue/networkQueue are untyped on Channel.
interface QueueLike {
  on(event: 'start' | 'finish', listener: () => void): unknown;
}

interface NetworkQueueLike {
  queueFor(id: string): QueueLike;
}

interface LocalQueueLike {
  start(): unknown;
  resendSentChanges(): unknown;
  // OMARCHY: boundary cast — sent/processQueue are untyped on LocalQueue.
  sent?: Record<string, unknown>;
  processQueue(id: string): unknown;
}

interface ChannelLike {
  localQueue?: LocalQueueLike;
  networkQueue?: NetworkQueueLike;
}

interface BucketLike {
  channel?: ChannelLike;
}

interface ClientLike {
  buckets?: BucketLike[];
}

type Flagged<T> = T & { __reconnectFix?: boolean };

/**
 * Per-channel state: the set of object ids whose network queue is still
 * running (opened by `queueFor`, closed on the queue's `'finish'`). A
 * reconnect's flush waits while this set is non-empty, i.e. while a
 * catch-up reply's changes are still being applied.
 */
const openNetworkQueues = new WeakMap<object, Set<string>>();

/**
 * Wrap one method of `obj` so the original call ALWAYS happens on a later
 * macrotask, once `countOpen()` has returned to zero — never synchronously
 * at invocation time. (`onAuth` calls `localQueue.start()` in the SAME
 * synchronous tick as `sendChangeVersionRequest(cv)`, so any check of
 * `countOpen()` at call time sees an always-empty queue and would be
 * vacuous; only a deferred re-check can observe the catch-up reply.) The
 * original is invoked EXACTLY once per wrapper call, optionally preceded by
 * `beforeCall`, which receives the value `capture` returned — `capture`
 * runs SYNCHRONOUSLY at wrapper-invocation time (T321: snapshot the state
 * of the world before the deferred work, e.g. which `sent` entries already
 * existed when the resend was requested). Never wraps twice.
 */
function guardUntilIdle<T extends object, C = undefined>(
  obj: T,
  key: keyof T,
  countOpen: () => number,
  beforeCall?: (captured: C | undefined) => void,
  capture?: () => C
): void {
  const original = obj[key] as unknown as Flagged<(...args: unknown[]) => unknown> | undefined;
  if (typeof original !== 'function' || original.__reconnectFix) {
    return;
  }
  const callOriginal = original.bind(obj) as (...args: unknown[]) => unknown;
  const wrapped = function (this: T, ...args: unknown[]): unknown {
    // T321: snapshot synchronously at invocation, before anything this
    // call defers can happen.
    const captured = capture?.();
    // Always defer the first check: the catch-up reply cannot have been
    // applied yet in this same tick, so a synchronous pass-through would
    // defeat the whole guard.
    const retry = () => {
      if (countOpen() === 0) {
        beforeCall?.(captured);
        callOriginal(...args);
      } else {
        setTimeout(retry, 10);
      }
    };
    setTimeout(retry, 10);
    return undefined;
  } as unknown as Flagged<T[keyof T]>;
  wrapped.__reconnectFix = true;
  obj[key] = wrapped;
}

function installOnChannel(channel: ChannelLike | undefined): void {
  const networkQueue = channel?.networkQueue;
  const localQueue = channel?.localQueue;
  if (!networkQueue || !localQueue) {
    return;
  }

  const originalQueueFor = networkQueue.queueFor as Flagged<
    NetworkQueueLike['queueFor']
  > | null;
  if (typeof originalQueueFor !== 'function' || originalQueueFor.__reconnectFix) {
    return;
  }

  // Count each distinct queue id as open while its vendored `Queue` is
  // running: +1 when the queue opens (a `'start'` after a `'finish'` re-opens
  // it, because the vendored NetworkQueue keeps one Queue per id and only
  // deletes it from `queues` on `'finish'`, channel.js:847-850), −1 on
  // `'finish'`. A vendored Queue emits `'finish'` whenever it drains
  // (channel.js:777-780), including the re-queue race inside
  // `updateObjectVersion` (channel.js:132-136), so the rebased change it
  // queues rides the next flush instead — never a stale one.
  const open = openNetworkQueues.get(networkQueue) ?? new Set<string>();
  openNetworkQueues.set(networkQueue, open);
  const countOpen = (): number => open.size;

  // Ids whose network queue drained ('finish') since the last purge. Their
  // `localQueue.sent[id]` entries may be stale: nothing ever calls
  // `localQueue.pause()` on a drop, so an offline edit is marked "sent"
  // while the socket is dead, and `dequeueChangesFor` (channel.js:848-861)
  // reads `sent[id]` without deleting it, so the stale entry survives the
  // OT rebase. `resendSentChanges` would blindly re-emit it with its old
  // `sv` (a 405 hit), and `processQueue` bails synchronously on a truthy
  // `sent[id]`, stranding the correctly-rebased change in `queues[id]`.
  const drainedSinceLastPurge = new Set<string>();

  const wrappedQueueFor = function (this: NetworkQueueLike, id: string) {
    const queue = originalQueueFor.call(this, id);
    if (!open.has(id)) {
      open.add(id);
      queue.on('finish', () => {
        open.delete(id);
        drainedSinceLastPurge.add(id);
      });
    }
    return queue;
  } as unknown as Flagged<NetworkQueueLike['queueFor']>;
  wrappedQueueFor.__reconnectFix = true;
  networkQueue.queueFor = wrappedQueueFor;

  // Right before the deferred resend fires: drop only the `sent[id]` entries
  // that ALREADY EXISTED when `resendSentChanges` was invoked (per the
  // snapshot the wrapper captured synchronously at that moment) AND whose
  // network queue has since drained — the genuinely stale ones from before
  // the reconnect. T321: entries created AFTER that invocation must be kept
  // even when their id drained. During the catch-up the OT rebase queues a
  // correctly-rebased merged change and `processQueue` sends it, marking it
  // `sent[id]` while it waits for its acknowledgement; its id drains in the
  // very same catch-up flush, so a purge that keyed on the drain alone would
  // delete this in-flight merged change. `internal.updateAcknowledged`
  // (channel.js:159) then fails its `localQueue.sent[id] === change` test,
  // never acknowledges the change, and treats it as another device's change
  // — rebasing the local edit onto the server a second time. The id alone
  // cannot tell the two apart (the stale change and the merged one share
  // it), so keep the entry unless `sent[id]` is the very same object
  // recorded at invocation, and never `processQueue(id)` in that case.
  const purgeStaleSent = (sentAtInvocation?: Map<string, unknown>): void => {
    const sent = localQueue.sent;
    if (!sent) {
      return;
    }
    for (const id of drainedSinceLastPurge) {
      if (id in sent && sent[id] === sentAtInvocation?.get(id)) {
        delete sent[id];
        localQueue.processQueue(id);
      }
    }
    drainedSinceLastPurge.clear();
  };

  guardUntilIdle(localQueue, 'start', countOpen);
  guardUntilIdle<LocalQueueLike, Map<string, unknown>>(
    localQueue,
    'resendSentChanges',
    countOpen,
    purgeStaleSent,
    () =>
      // 'ready' is emitted synchronously in `onChanges` (channel.js:702-714)
      // before any queued change has run, so this synchronous snapshot holds
      // only entries from before this catch-up.
      new Map(Object.entries(localQueue.sent ?? {}))
  );
}

/**
 * Hook every channel of a simperium client so a reconnect's local-queue
 * flush and sent-change resend wait for the network catch-up queue to
 * drain. Safe to call more than once; never throws on a client without
 * channels.
 */
export function installSimperiumReconnectFix(client: unknown): void {
  // OMARCHY: boundary cast
  const withBuckets = (client ?? {}) as ClientLike;
  for (const bucket of withBuckets.buckets ?? []) {
    installOnChannel(bucket?.channel);
  }
}

/**
 * T313/T314 — resolves once the named bucket's first catch-up after connect
 * has been applied: the channel has emitted `'ready'` (after the change-version
 * reply, channel.js:714, or a full re-index, channel.js:276) AND every per-object
 * network queue that reply opened has drained, so the ghost store holds the
 * server's current version of every object. Requires `installSimperiumReconnectFix`
 * to have wrapped the channel (it keeps the open-queue count). Resolves at once
 * when the client has no such bucket.
 *
 * FALLBACK (T313/T314, live finding 2026-09-25): a live-service trial (4/5
 * kept both edits, 1/5 lost the offline edit) proved 'ready' can simply
 * never fire. `Channel.prototype.onChanges` (channel.js:702-714) and
 * `indexingComplete` (channel.js:273-276) are the ONLY two places that emit
 * `'ready'` (`grep -n "emit('ready')" node_modules/simperium/lib/simperium/channel.js`),
 * and both require the cv catch-up reply (or a re-index) to actually arrive
 * and be handled; a degenerate or dropped reply means neither runs and the
 * promise below would hang forever, silently stranding the held offline
 * edit for the rest of the session (safe on disk, but never sent).
 * /tmp/snote-catchup-debug.log shows two prior real sessions with a
 * "wait registered" and no matching "ready fired" — this exact hang — and a
 * normal run where 'ready' fired ~1114 ms after registration (1790318326892
 * - 1790318325778). So: once the channel's OWN auth has succeeded (the
 * "connected" signal — NOT the socket-open 'connect' event, which fires
 * before authentication and before any cv/index request is even sent), arm
 * a bounded fallback timer. Per docs/reference/simperium-wire.md, a
 * successful auth reply is a plain string (`<channel>:auth:<email>`); a
 * failed one is a JSON error object, which `Channel.prototype.onAuth`
 * (channel.js:609-637) detects with a `JSON.parse` that only throws on the
 * success case — the same test is used below via `channel.message`'s
 * `'auth'` event (channel.js:390, a plain EventEmitter we can add a second
 * listener to without touching vendored code). 4000 ms is >3x the measured
 * normal ~1114 ms, bounding the user-visible stall while leaving headroom
 * for a slower real network. If the connection drops before the timer
 * fires (client `'disconnect'`, client.js:141), the timer is cancelled:
 * sending the held edit while disconnected, or before the NEXT auth
 * succeeds, would be wrong — the edit stays safely held on disk and this
 * function keeps waiting for the next 'ready' or the next successful auth.
 */
export function whenCatchUpApplied(client: unknown, bucketName: string): Promise<void> {
  const buckets = ((client ?? {}) as { buckets?: Array<{ name?: string; channel?: unknown }> }).buckets ?? [];
  const channel = buckets.find((b) => b?.name === bucketName)?.channel as
    | (ChannelLike & {
        once?: (event: string, fn: () => void) => unknown;
        message?: {
          on: (event: string, fn: (data: string) => void) => unknown;
          off?: (event: string, fn: (data: string) => void) => unknown;
        };
      })
    | undefined;
  if (!channel || typeof channel.once !== 'function') {
    return Promise.resolve();
  }
  const FALLBACK_MS = 4000;
  // OMARCHY: boundary cast — the simperium client is an untyped EventEmitter.
  const clientEmitter = (client ?? {}) as {
    on?: (event: string, fn: () => void) => unknown;
    off?: (event: string, fn: () => void) => unknown;
  };
  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const clearFallback = (): void => {
      if (fallbackTimer !== undefined) {
        clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
    };

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearFallback();
      channel.message?.off?.('auth', onAuthMessage);
      clientEmitter.off?.('disconnect', onDisconnect);
      resolve();
    };

    // Success is a plain string (the account email); failure is JSON (an
    // error object) — see the wire-protocol comment above.
    const onAuthMessage = (data: string): void => {
      let isErrorReply = true;
      try {
        JSON.parse(data);
      } catch {
        isErrorReply = false;
      }
      if (isErrorReply) return; // unauthorized: stay held, do not arm the fallback
      clearFallback();
      fallbackTimer = setTimeout(finish, FALLBACK_MS);
    };

    const onDisconnect = (): void => {
      // Not connected: never resolve on a stale timer while offline.
      clearFallback();
    };

    channel.message?.on('auth', onAuthMessage);
    clientEmitter.on?.('disconnect', onDisconnect);

    channel.once?.('ready', () => {
      // 'ready' is emitted before the reply's queued changes run; wait for them.
      const check = (): void => {
        if (settled) return;
        const open = channel.networkQueue ? openNetworkQueues.get(channel.networkQueue) : undefined;
        if (!open || open.size === 0) finish();
        else setTimeout(check, 10);
      };
      setTimeout(check, 10);
    });
  });
}

export default installSimperiumReconnectFix;
