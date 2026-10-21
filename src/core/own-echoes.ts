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

import { editIncluded } from './line-inclusion';
import { createSentChanges } from './sent-changes';
import { loadTombstones } from './tombstones';

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
    queue?(change: { type: 'modify'; id: string; object: Record<string, unknown> }): void;
    on(event: string, fn: (change: WireChange) => void): void;
    removeListener(event: string, fn: (change: WireChange) => void): void;
  };
  on(event: string, fn: (id: string, change: WireChange) => void): void;
  removeListener(event: string, fn: (id: string, change: WireChange) => void): void;
  store?: {
    eachGhost(
      fn: (ghost: { key: string; version?: number; data: Record<string, unknown> }) => void
    ): void;
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
  dir: string,
  loadedNotes?: { get(id: string): unknown }
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

  const localCopy = (id: string): Note | undefined => {
    let local: Note | undefined;
    notes?.get(id, (_e, o) => {
      local = o?.data;
    });
    return local;
  };
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

  // The fields the echo changes whose local value is not the value the echo
  // gives them on top of the ghost (none: the local note already holds the
  // echo); undefined when the echo cannot be applied.
  // #28 — with `alone` (no later change for the note in the same frame), a
  // local modificationDate later than the echo's is held too: a session
  // action stamped it.
  const notHeld = (
    change: { id: string; v?: Note },
    ghost: Note,
    alone: boolean
  ): string[] | undefined => {
    const keys = Object.keys(change.v ?? {});
    if (keys.length === 0) return [];
    const local = localCopy(change.id);
    try {
      const target = apply(change.v, ghost) as Note;
      return keys.filter(
        (k) =>
          !same(local?.[k], target[k]) &&
          !(alone && k === 'modificationDate' && Number(local?.[k]) > Number(target[k]))
      );
    } catch {
      return undefined;
    }
  };

  // #28 — true when the local note differs from the echo applied to the ghost
  // in a field other than modificationDate: a change made on top of the
  // pre-quit one, which must go out on its own send.
  const changedOnTop = (change: { v?: Note }, ghost: Note, local: Note): boolean => {
    try {
      const target = apply(change.v ?? {}, ghost) as Note;
      return Object.keys({ ...local, ...target }).some(
        (k) => k !== 'modificationDate' && !same(local[k], target[k])
      );
    } catch {
      return false;
    }
  };

  // F206 — true when the user set every field the local note does not hold
  // in this session: the local copy is newer than both the note as loaded
  // from state.json (`loadedNotes`, read-only) and the ghost (a user action
  // stamps this machine's time; a start-up write such as a ghost restored
  // over the loaded copy does not), and each of those fields differs from
  // the loaded copy. Then the echo only confirms the pre-quit send, and the
  // user's edit goes out on its own send against the confirmed copy.
  // Otherwise today's rule stands (the F198 crash-before-save rows: the
  // echo is applied as before).
  const setThisSession = (id: string, keys: string[], ghost: Note): boolean => {
    const loaded = loadedNotes?.get(id) as Note | undefined;
    const local = localCopy(id);
    if (!loaded || !local) return false;
    const newest = Math.max(Number(loaded.modificationDate) || 0, Number(ghost.modificationDate) || 0);
    if (!(Number(local.modificationDate) > newest)) return false;
    const fields = keys.filter((k) => k !== 'modificationDate');
    return fields.length > 0 && fields.every((k) => !same(local[k], loaded[k]));
  };

  // #27 — true when the note as loaded from state.json holds the echo plus a
  // later save made before the quit (queued behind the unconfirmed send): it
  // is newer than the echo, and the only field it does not hold as the echo
  // gives it is content whose change from the ghost includes the echo's.
  const savedOnTop = (change: { id: string; v?: Note }, keys: string[], ghost: Note): boolean => {
    const loaded = loadedNotes?.get(change.id) as Note | undefined;
    const local = localCopy(change.id);
    if (!loaded || !local) return false;
    try {
      const target = apply(change.v ?? {}, ghost) as Note;
      if (!(Number(loaded.modificationDate) > Number(target.modificationDate))) return false;
      const fields = keys.filter((k) => k !== 'modificationDate');
      return (
        fields.length > 0 &&
        fields.every(
          (k) =>
            k === 'content' &&
            editIncluded(String(ghost.content ?? ''), String(target.content ?? ''), String(local.content ?? ''))
        )
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
        const changes = JSON.parse(data) as Array<{ id: string; v?: Note; sv?: number }>;
        const at = changes.findIndex((c) => c?.id === id);
        const change = changes[at];
        // #28 — `echoes` also returns an echo whose note has a change in
        // flight from the same version: the server already holds the
        // pre-quit change, so it rejects that change (405). Seed over it only
        // when no later change for the note follows in this frame (until the
        // frame is applied the user's change lives only in the local copy),
        // and queue the local copy so the user's change goes out against
        // the confirmed copy.
        const alone = !changes.slice(at + 1).some((c) => c?.id === id);
        if (inFlight[id] !== undefined && !alone) continue;
        let ghost: { version?: number; data: Note } | undefined;
        channel.store?.eachGhost((g) => {
          if (g.key === id) ghost = g;
        });
        // F190 (#23) — the library defers an echo whose `sv` is not the
        // ghost's version (channel.js:210-218), so a seed for it would wait
        // in `sent` and `resendSentChanges` would re-send it after a
        // reconnect: seed only an echo that applies at once, with that `sv`.
        const version = ghost?.version;
        if (!change || (version !== undefined && change.sv !== version)) continue;
        // #93 (F226) — a note deleted forever on this machine (tombstones.json
        // names it; its local copy may not be removed yet) only confirms the
        // pre-quit send: applied, the echo would re-create the note and drop
        // the remove. Nothing is queued for it.
        const removing = loadTombstones(dir).includes(id);
        const keys = removing ? [] : notHeld(change, ghost?.data ?? {}, alone);
        if (keys === undefined) continue;
        const newer =
          keys.length > 0 && (setThisSession(id, keys, ghost?.data ?? {}) || savedOnTop(change, keys, ghost?.data ?? {}));
        if (keys.length > 0 && !newer) continue;
        const seed: Record<string, unknown> = { id, ccid, o: 'M', v: {} };
        if (version !== undefined) seed.sv = version;
        channel.localQueue.sent[id] = seed;
        const local = localCopy(id);
        if (alone && local && !removing && changedOnTop(change, ghost?.data ?? {}, local))
          channel.localQueue.queue?.({ type: 'modify', id, object: local });
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
