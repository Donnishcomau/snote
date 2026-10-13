/**
 * T523 — the server's echo of a change sent before snote quit must read
 * as THIS client's confirmation after a restart, not as another device's
 * change.
 *
 * The cause (F178, issue #9): a change goes out, the server applies it,
 * and snote dies before the reply lands. The local note already holds
 * the edit; after restart the echo arrives with no match in the library's
 * in-memory `localQueue.sent`, so `internal.findAcknowledgedChange`
 * (node_modules/simperium/lib/simperium/channel.js:165-171) misses, the
 * local copy is OT-rebased onto the echo, and the edit lands a second
 * time — for this client and every other device.
 *
 * The library takes an incoming change as its own acknowledgement when
 * `localQueue.sent[id]` holds an object whose `ccid` appears in that
 * change's `ccids`, and then emits `'acknowledge'` (channel.js:161)
 * instead of applying it. `Channel.prototype.onChanges` is bound to
 * `message.on('c', ...)` at construction (channel.js:392), so a listener
 * added with `message.prependListener('c', ...)` runs first: for each
 * change T519's record recognises as an echo (`createSentChanges`'s
 * `echoes`, which matches only entries LOADED at open — a change sent
 * this session is never its own echo — and skips every id the library
 * already has in flight), seed the sent entry so the library
 * acknowledges the echo.
 *
 * An id `localQueue.sent` already holds is never seeded over: `onAuth`
 * starts the local queue before it asks for the catch-up
 * (channel.js:625-629), so an edit made between auth and the catch-up
 * sits there by the time the echo arrives, and replacing that entry
 * would remove the library's only handle on the change — its reply
 * would then match nothing (channel.js:165-171) and be applied as
 * another device's change. An echo that arrives after `settle` drained
 * the loaded entries is not recognised and is applied as before, exactly
 * as it was before this module existed: doubled, never lost.
 *
 * The record itself stays current while the app runs: every change
 * going out is `localQueue`'s `'send'` (channel.js:892) — note the
 * channel's OWN `'send'` carries wire strings (channel.js:406), not
 * change objects, and is skipped; every confirmation is the channel's
 * `'acknowledge'` (channel.js:161). `settle`, run once the start-up
 * catch-up is applied, drops loaded entries whose echo never came.
 * `stop`, run at quit and at logout, detaches every listener and stops
 * the record from touching `sent-changes.json` again: the library keeps
 * sending and acknowledging until `client.end()`, and a late write
 * after a logout would bring the account folder back with the record.
 */

import { apply } from 'simperium/lib/simperium/util/change';

import { createSentChanges } from './sent-changes';

// Boundary types of the vendored channel — copied from the verified
// shapes, not derived from the (untyped) library.
interface WireChange {
  id: string;
  ccid?: string;
}

interface NoteChannel {
  message: {
    prependListener(event: string, fn: (data: string) => void): void;
    removeListener(event: string, fn: (data: string) => void): void;
  };
  localQueue: {
    sent: Record<string, unknown>;
    on(event: string, fn: (change: WireChange) => void): void;
    removeListener(event: string, fn: (change: WireChange) => void): void;
  };
  on(event: string, fn: (id: string, change: WireChange) => void): void;
  removeListener(event: string, fn: (id: string, change: WireChange) => void): void;
  store?: {
    eachGhost(fn: (ghost: { key: string; data: Record<string, unknown> }) => void): void;
  };
}

type Note = Record<string, unknown>;

/**
 * Hook the note channel of a simperium client to `sent-changes.json`:
 * record outgoing changes and acknowledgements, and make the server's
 * echo of a change sent before the previous quit the library's own
 * in-flight change so it is acknowledged, not applied — never over a
 * change the library already has in flight for that note. Safe to call
 * on a client without a note channel: nothing is hooked and `settle`
 * still drains the record. `settle` drops loaded entries whose echo
 * never came; `stop` detaches every listener and makes every later
 * write to `sent-changes.json` a no-op. Never throws.
 */
export function trackOwnEchoes(
  client: unknown,
  dir: string
): { settle: () => void; stop: () => void } {
  const record = createSentChanges(dir);
  // After `stop` the library can still send and acknowledge for a
  // moment; every write past this point is dropped so a quit or logout
  // never leaves `sent-changes.json` (or its folder) behind.
  let stopped = false;
  const sent = (id: string, ccid: string): void => {
    if (!stopped) record.sent(id, ccid);
  };
  const acknowledged = (id: string, ccid: string): void => {
    if (!stopped) record.acknowledged(id, ccid);
  };

  // OMARCHY: boundary cast — the simperium client's buckets are untyped.
  const buckets =
    (client as { buckets?: Array<{ name: string; channel?: unknown; store?: unknown }> })
      ?.buckets ?? [];
  const bucket = buckets.find((b) => b?.name === 'note');
  // OMARCHY: boundary cast — the note channel is an untyped EventEmitter.
  const channel = (bucket?.channel ?? undefined) as NoteChannel | undefined;
  const notes = bucket?.store as
    | { get(id: string, cb: (e: unknown, o?: { data?: Note }) => void): void }
    | undefined;

  // True when the local note already holds the echoed change: every field
  // the echo changes has, locally, the value the echo gives it on top of
  // the ghost. An empty change holds trivially.
  const holds = (change: { id: string; v?: Note }): boolean => {
    const keys = Object.keys(change.v ?? {});
    if (keys.length === 0) return true;
    let ghost: Note | undefined;
    channel?.store?.eachGhost((g) => {
      if (g.key === change.id) ghost = g.data;
    });
    let local: Note | undefined;
    notes?.get(change.id, (_e, o) => {
      local = o?.data;
    });
    try {
      const target = apply(change.v, ghost ?? {}) as Note;
      return keys.every(
        (k) => JSON.stringify(local?.[k]) === JSON.stringify(target[k])
      );
    } catch {
      return false;
    }
  };

  // Held so `stop` can detach exactly what was attached.
  let seedEcho: ((data: string) => void) | undefined;
  let recordSend: ((change: WireChange) => void) | undefined;
  let dropAck: ((id: string, change: WireChange) => void) | undefined;

  if (channel?.message && channel.localQueue && channel.on) {
    // Runs before the library's own `message.on('c', ...)` (channel.js:392):
    // seed the library's in-flight change for every echo the record
    // recognises, so `findAcknowledgedChange` matches and the echo is
    // acknowledged instead of applied to the copy that already has it.
    seedEcho = (data: string) => {
      // Pass the library's live in-flight map as `inFlight`: `echoes`
      // skips every id it holds (sent-changes.ts:137), so an echo is
      // never seeded over a change the library already has in flight
      // for that note — that entry is its only handle on the change.
      const inFlight = channel.localQueue.sent;
      for (const { id, ccid } of record.echoes(data, inFlight)) {
        const change = (JSON.parse(data) as Array<{ id: string; v?: Note }>).find(
          (c) => c?.id === id
        );
        if (change && holds(change)) {
          channel.localQueue.sent[id] = { id, ccid, o: 'M', v: {} };
        }
      }
    };
    channel.message.prependListener('c', seedEcho);

    // A change going out is localQueue's `'send'` (channel.js:892) — a
    // change object. The channel's OWN `'send'` carries `c:` strings
    // (channel.js:406); a string has no usable `id`/`ccid`, so only
    // objects with both are recorded.
    recordSend = (change: WireChange) => {
      if (change && typeof change === 'object' && change.id && change.ccid) {
        sent(change.id, change.ccid);
      }
    };
    channel.localQueue.on('send', recordSend);

    // The library emits `'acknowledge'` for its own change once the
    // reply matches (channel.js:161) — the echo seeded above leaves the
    // record here, exactly like a normal reply.
    dropAck = (id: string, change: WireChange) => {
      if (change?.ccid) {
        acknowledged(id, change.ccid);
      }
    };
    channel.on('acknowledge', dropAck);
  }

  return {
    settle: () => {
      if (!stopped) record.settle();
    },
    stop: () => {
      stopped = true;
      if (channel?.message && seedEcho) channel.message.removeListener('c', seedEcho);
      if (channel?.localQueue && recordSend)
        channel.localQueue.removeListener('send', recordSend);
      if (channel?.on && dropAck) channel.removeListener('acknowledge', dropAck);
    },
  };
}

export default trackOwnEchoes;
