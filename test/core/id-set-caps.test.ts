/**
 * Issue #202: the two note-id Sets that lived
 * for the whole session are capped, oldest dropped first.
 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { REMOVED_ID_CAP, installSimperiumRemovedNoteFix } from '../../src/core/simperium-removed-note-fix';
import { REVISION_ID_CAP } from '../../vendor/simplenote/state/simperium/middleware';

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

afterEach(() => vi.restoreAllMocks());

describe('issue #202 note-id sets have a cap', () => {
  it('1: WHEN the channel has emitted remove for `5001` ids THEN the oldest id is forgotten (its late version reply is delivered), the newest ids are still dropped, and the cap is `5000`', () => {
    expect(REMOVED_ID_CAP).toBe(5000);
    const channel = new EventEmitter();
    installSimperiumRemovedNoteFix({ buckets: [{ name: 'note', channel }] });
    for (let i = 0; i <= REMOVED_ID_CAP; i++) channel.emit('remove', `r${i}`);
    const seen: string[] = [];
    channel.on('version.r0.1', () => seen.push('r0'));
    channel.on('version.r1.1', () => seen.push('r1'));
    channel.on(`version.r${REMOVED_ID_CAP}.1`, () => seen.push('newest'));
    channel.emit('version.r0.1', 'r0', 1, {});
    channel.emit('version.r1.1', 'r1', 1, {});
    channel.emit(`version.r${REMOVED_ID_CAP}.1`, 'newest', 1, {});
    expect(seen).toEqual(['r0']);
  });

  it('2: WHEN more than `5000` distinct notes are opened and the first one is opened again THEN its revisions are preloaded once more; a second open of a note still remembered schedules no second preload', async () => {
    expect(REVISION_ID_CAP).toBe(5000);
    const server = new FakeSimperiumServer();
    await server.start();
    const now = Date.now();
    server.seedBucket('test-app', 'note', [
      { id: 'n1', data: { content: 'c', creationDate: now, deleted: 0, modificationDate: now, systemTags: [], tags: [] } },
    ]);
    const store = makeStore({
      sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', clientOptions: { url: server.url }, noteEditDelayMs: 10 },
    });
    try {
      await waitForNotes(store, 8000);
      const spy = vi.spyOn(globalThis, 'setTimeout');
      const preloads = (): number =>
        spy.mock.calls.filter((c) => c[1] === 250 && String(c[0]).includes('getRevisions')).length;
      const open = (id: string): void => void store.dispatch({ type: 'OPEN_NOTE', noteId: id } as never);
      const start = preloads();
      open('n1');
      expect(preloads() - start).toBe(1);
      open('n1');
      expect(preloads() - start).toBe(1);
      for (let i = 0; i < REVISION_ID_CAP - 1; i++) open(`x${i}`);
      open('n1');
      expect(preloads() - start).toBe(REVISION_ID_CAP);
      open('x-extra');
      open('n1');
      expect(preloads() - start).toBe(REVISION_ID_CAP + 2);
    } finally {
      store.stopSync?.();
      server.stop();
    }
  }, 20000);

  it('3: WHEN the two files are read THEN each compares its set size with `REMOVED_ID_CAP` or `REVISION_ID_CAP` and deletes the oldest entry, and neither set is created without a cap check', () => {
    const removed = read('src/core/simperium-removed-note-fix.ts');
    const middleware = read('vendor/simplenote/state/simperium/middleware.ts');
    expect(removed).toContain('removed.size > REMOVED_ID_CAP');
    expect(removed).toContain('removed.values().next().value');
    expect(middleware).toContain('hasRequestedRevisions.size > REVISION_ID_CAP');
    expect(middleware).toContain('hasRequestedRevisions.values().next().value');
    expect(removed.split('\n').filter((l) => l.includes('removed.add(')).length).toBe(1);
    expect(middleware.split('\n').filter((l) => l.includes('hasRequestedRevisions.add(')).length).toBe(1);
  });
});
