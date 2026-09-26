/**
 * T319 — a note deleted forever on another device comes back after snote
 * catches up.
 *
 * During a catch-up, `internal.applyChange`
 * (node_modules/simperium/lib/simperium/channel.js:209-217) answers a
 * MODIFY whose `sv` differs from the local ghost's version by asking the
 * server for version `sv` (`internal.requestObjectVersion`,
 * channel.js:175-184) and RETURNING WITHOUT WAITING. `onChanges`' per-id
 * network queue (channel.js:702-713) therefore runs the next change for
 * that id right away; when that next change is the REMOVE,
 * `internal.removeObject` (channel.js:144-154) deletes the ghost and
 * emits `'remove'` first. The `e:` reply then arrives, the
 * `version.<id>.<sv>` listener resolves, and `applyChange` re-runs with
 * a synthesized ghost, so `internal.updateObjectVersion`
 * (channel.js:100-139) writes the ghost back and emits `'update'` — the
 * note is re-created locally although the server no longer has it.
 * (Live finding 2026-09-26: a stale cache came back with 31 notes where
 * the account holds 4.)
 *
 * This module never revives a removed id: per note-bucket channel, every
 * id the channel emits `'remove'` for (only changes from other clients
 * emit it, channel.js:147-148 — local deletes are untouched) is
 * remembered, and the channel's own `emit` is wrapped so an event named
 * `version.<id>.<anything>` for a remembered id is not delivered
 * (`return false`). With no listener ever resolved,
 * `requestObjectVersion`'s promise stays pending and `applyChange` never
 * writes the ghost or emits `'update'`. Every other event — including
 * the `'remove'` itself, since the id is only remembered AFTER it is
 * delivered — goes through unchanged.
 */

// OMARCHY: boundary cast — Channel is untyped where it reaches through
// the simperium client's `buckets`; only these members are touched.
interface ChannelLike {
  on(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
}

interface BucketLike {
  name?: string;
  channel?: ChannelLike;
}

interface ClientLike {
  buckets?: BucketLike[];
}

/**
 * Channels already wired in this process. `channel.on`/`channel.emit`
 * are inherited from `EventEmitter.prototype` — the SAME function object
 * on every Channel — so a flag written onto a prototype method would
 * leak across channels. The `channel` object itself is per-instance,
 * which is how `simperium-stale-delete-fix.ts` stays instance-safe too.
 */
const installed = new WeakSet<object>();

/**
 * Wrap one channel's own `emit` so a `version.<id>.<anything>` event for
 * an id this channel already emitted `'remove'` for is never delivered.
 * Safe to call more than once on the same channel.
 */
function installOnChannel(channel: ChannelLike | undefined): void {
  if (!channel || typeof channel.on !== 'function' || typeof channel.emit !== 'function') {
    return;
  }
  if (installed.has(channel)) {
    return;
  }
  installed.add(channel);

  // Ids the channel emitted `'remove'` for: the server does not have
  // them, so a version reply arriving late must not re-create them.
  const removed = new Set<string>();

  channel.on('remove', (id: unknown) => {
    if (typeof id === 'string') {
      removed.add(id);
    }
  });

  const originalEmit = channel.emit.bind(channel);
  channel.emit = (event: string, ...args: unknown[]): boolean => {
    if (typeof event === 'string' && event.startsWith('version.')) {
      // `version.<id>.<version>` — `e:` ids never contain a dot, so the
      // second segment IS the id.
      const id = event.slice('version.'.length).split('.')[0];
      if (removed.has(id)) {
        return false;
      }
    }
    return originalEmit(event, ...args);
  };
}

/**
 * Hook every note-bucket channel of a simperium client so a late
 * version reply can never re-create a locally-removed note. Safe to
 * call more than once; never throws on a client without channels.
 */
export function installSimperiumRemovedNoteFix(client: unknown): void {
  // OMARCHY: boundary cast
  const withBuckets = (client ?? {}) as ClientLike;
  for (const bucket of withBuckets.buckets ?? []) {
    if (bucket?.name === 'note') {
      installOnChannel(bucket.channel);
    }
  }
}

export default installSimperiumRemovedNoteFix;
