/**
 * T537 The T536 cache release fails safe: with simperium's `revisionCache`
 * export missing or not a Map, history still opens and loads its versions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('simperium/lib/simperium/channel');
});

async function openAndClose(cacheValue: unknown): Promise<unknown[]> {
  vi.resetModules();
  vi.doMock('simperium/lib/simperium/channel', () => ({ revisionCache: cacheValue }));
  const { installSimperiumRevisionCacheFix } = await import(
    '../../src/core/simperium-revision-cache-fix'
  );
  const channel: any = { getRevisions: () => Promise.resolve([{ version: 3 }, { version: 2 }]) };
  installSimperiumRevisionCacheFix({ buckets: [{ channel }] });
  const revs = await channel.getRevisions('note1'); // open
  return revs; // close releases nothing here; must not throw
}

describe('T537 revision cache fix fails safe', () => {
  it('1: WHEN simperium\'s `revisionCache` export is missing (undefined) THEN installing the fix and fetching the revisions of a note does not throw and resolves with its `2` versions', async () => {
    const revs = await openAndClose(undefined);
    expect(revs.length).toBe(2);
  });

  it('2: WHEN simperium\'s `revisionCache` export is not a Map (a plain object) THEN installing the fix and fetching the revisions of a note does not throw and resolves with its `2` versions', async () => {
    const revs = await openAndClose({ 'note1.1': 'x' });
    expect(revs.length).toBe(2);
  });
});
