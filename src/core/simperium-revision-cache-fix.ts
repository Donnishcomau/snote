/**
 * T536 — simperium's note-history cache never lets go.
 *
 * In the pinned `simperium@1.1.4` client, `Channel.getRevisions` fills the
 * module-level `revisionCache` (a `Map` keyed `<id>.<version>`,
 * node_modules/simperium/lib/simperium/channel.js) with every version it
 * fetches and nothing ever evicts it, so each history open of a note that
 * keeps gaining versions grows the heap for the whole session.
 *
 * The app copies the versions it needs into Redux (`noteRevisions`) as soon
 * as the fetch resolves, so this module wraps each bucket channel's
 * `getRevisions`: once the fetch settles (resolved or rejected) every
 * `revisionCache` key starting `<id>.` is deleted.
 *
 * The cache is imported by its NAMED export. The default import of this
 * module is the exports object in the esbuild bundle, not the `Channel`
 * class, so patching `Channel.prototype` through it crashes the built app.
 */
import { revisionCache } from 'simperium/lib/simperium/channel';

type GetRevisions = ((id: string) => Promise<unknown>) & { __revisionCacheFix?: boolean };

interface ChannelWithRevisions {
  getRevisions?: GetRevisions;
}

interface ClientWithBuckets {
  buckets?: Array<{ channel?: ChannelWithRevisions }>;
}

/**
 * Fail safe (T537): if a simperium update removes, renames or retypes the
 * `revisionCache` export, the patch does nothing, so history opens and works
 * as before, only without the memory release.
 */
function usableCache(): Map<string, unknown> | undefined {
  // OMARCHY: boundary cast
  const cache = revisionCache as unknown;
  return cache instanceof Map ? (cache as Map<string, unknown>) : undefined;
}

function dropVersionsOf(id: string): void {
  const cache = usableCache();
  if (!cache) {
    return;
  }
  const prefix = `${id}.`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function installSimperiumRevisionCacheFix(client: unknown): void {
  if (!usableCache()) {
    return;
  }
  const withBuckets = (client ?? { buckets: [] }) as ClientWithBuckets;
  for (const bucket of withBuckets.buckets ?? []) {
    const channel = bucket?.channel;
    if (!channel || typeof channel.getRevisions !== 'function') {
      continue;
    }
    if (channel.getRevisions.__revisionCacheFix) {
      continue;
    }
    const original = channel.getRevisions.bind(channel);
    const wrapped: GetRevisions = (id: string) =>
      original(id).then(
        (result) => {
          dropVersionsOf(id);
          return result;
        },
        (error: unknown) => {
          dropVersionsOf(id);
          throw error;
        }
      );
    wrapped.__revisionCacheFix = true;
    channel.getRevisions = wrapped;
  }
}

export default installSimperiumRevisionCacheFix;
