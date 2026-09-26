/**
 * T272 / T281 — a brand-new note's own change-confirmation never arrives.
 *
 * In the pinned `simperium@1.1.4` client, when a locally created object's
 * own change echoes back from the server it carries no `sv` (a new object
 * has no source version), so `internal.requestObjectVersion`
 * (node_modules/simperium/lib/simperium/channel.js:175-183) asks the
 * server for a version that never existed: it registers a `once` listener
 * on `"version.<id>.undefined"` and sends `"e:<id>.undefined"`.
 *
 * T281: the real Simperium service answers that malformed request with the
 * protocol's "invalid version" marker (`\n?`), and
 * `Channel.prototype.onVersion` (channel.js:727-730) returns WITHOUT
 * emitting anything on that marker — so T272's `.NaN`→`.undefined`
 * event-alias (which only ever fired on a real emit) never helped, and the
 * promise gating `localQueue.sent[id]` never resolved: `pendingCount`
 * stayed stuck at `1` forever.
 *
 * This module no longer depends on the server's reply at all. It wraps
 * `Channel.prototype.send` per bucket channel: a message exactly equal to
 * `"e:<id>.undefined"` is NOT forwarded to the real send; instead, on the
 * next tick, the module calls `channel.emit("version.<id>.undefined", {})`
 * directly, so the `once` listener resolves with `{}` — exactly the
 * `ghost.data` a brand-new object was diffed against when `buildChange`
 * built this very change (util/change.js:70 `object_diff(ghost.data,
 * object)` with `ghost.data === {}`), so re-deriving it locally needs no
 * server round-trip. Every other `send(...)` call passes through to the
 * original `send` unchanged.
 */

// Shape of the slice of the simperium client this workaround touches.
interface ChannelWithSend {
  send?: (data: string) => unknown;
  emit?: (event: string, ...args: unknown[]) => unknown;
}

interface BucketWithChannel {
  channel?: ChannelWithSend;
}

interface ClientWithBuckets {
  buckets?: BucketWithChannel[];
}

const UNDEFINED_REQUEST = /^e:(.+)\.undefined$/;

export function installSimperiumVersionFix(client: unknown): void {
  // OMARCHY: boundary cast
  const withBuckets = (client ?? { buckets: [] }) as ClientWithBuckets;
  for (const bucket of withBuckets.buckets ?? []) {
    const channel = bucket?.channel;
    if (!channel || typeof channel.send !== 'function') {
      continue;
    }
    if ((channel.send as { __versionFix?: boolean }).__versionFix) {
      continue;
    }
    const originalSend = channel.send.bind(channel);
    const wrappedSend = function (data: string): unknown {
      const match = typeof data === 'string' ? data.match(UNDEFINED_REQUEST) : null;
      if (match && typeof channel.emit === 'function') {
        // The server can only answer this request with "invalid version"
        // (which the vendored client silently swallows), so never put it
        // on the wire: resolve the `once("version.<id>.undefined")`
        // listener right here with the empty ghost data the change was
        // built against. Deferred a tick so the listener registration in
        // requestObjectVersion has definitely happened.
        const id = match[1];
        setTimeout(() => {
          channel.emit!(`version.${id}.undefined`, {});
        }, 0);
        return undefined;
      }
      return originalSend(data);
    } as unknown as typeof channel.send & { __versionFix?: boolean };
    wrappedSend.__versionFix = true;
    channel.send = wrappedSend;
  }
}

export default installSimperiumVersionFix;
