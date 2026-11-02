/**
 * (#125) — a note deleted forever just after a re-index start comes back.
 *
 * A start that must re-index (unknown change version) gets every note again
 * as index pages (`i` messages). `Channel.prototype.onIndex`
 * (node_modules/simperium/lib/simperium/channel.js, around line 667) passes
 * each object to `internal.updateObjectVersion` as another device's change:
 * that drops the queued remove (`dequeueChangesFor`) and saves the server's
 * copy, so a note the user deleted forever moments before is re-created
 * locally and the remove never goes out. sync-6 (#93) covers the prompt start
 * (`c` frames); this covers the index.
 *
 * The note channel's `i` listeners are wrapped so an index page reaches the
 * library without the notes tombstones.json names (deleted forever on this
 * machine and not yet confirmed: `resendDeletions` keeps an id only while the
 * ghost still has a version). The queued remove then goes out as usual, and
 * the stale-delete diff (simperium-stale-delete-fix.ts) drops any local copy
 * left. A page that is not JSON, has no `index` list or names no tombstoned
 * note is passed on unchanged. Never throws.
 */
import { loadTombstones } from './tombstones';

interface IndexEmitter {
  listeners(event: string): Array<(data: string) => void>;
  removeListener(event: string, fn: (data: string) => void): void;
  on(event: string, fn: (data: string) => void): void;
}

/** The index page `data` without the objects whose id is in tombstones.json under `dir`. */
export function withoutTombstoned(data: string, dir: string): string {
  let page: { index?: Array<{ id?: unknown }> } | null;
  try {
    page = JSON.parse(data) as { index?: Array<{ id?: unknown }> } | null;
  } catch {
    return data;
  }
  if (!page || typeof page !== 'object' || !Array.isArray(page.index)) return data;
  const gone = new Set(loadTombstones(dir));
  if (gone.size === 0) return data;
  const index = page.index.filter((o) => !(o && typeof o.id === 'string' && gone.has(o.id)));
  return index.length === page.index.length ? data : JSON.stringify({ ...page, index });
}

/** Wrap the note channel's `i` listeners of `client` (see above); a client with no note channel is left alone. */
export function installTombstoneIndexFix(client: unknown, dir: string): void {
  // OMARCHY: boundary cast — the simperium client's buckets are untyped.
  const buckets = (client as { buckets?: Array<{ name?: string; channel?: { message?: IndexEmitter } }> })?.buckets ?? [];
  const message = buckets.find((b) => b?.name === 'note')?.channel?.message;
  if (!message || typeof message.listeners !== 'function') return;
  for (const original of message.listeners('i')) {
    message.removeListener('i', original);
    message.on('i', (data: string) => original(withoutTombstoned(data, dir)));
  }
}
