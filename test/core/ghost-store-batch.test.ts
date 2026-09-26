import { mkdtempSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import { FileGhostStore } from '../../src/core/ghost-store.js';

type Data = Record<string, number>;

// The burst: 50 puts in one tight loop, as the first sync of a large
// account does (the sync library calls put once per note while the index
// streams in).
async function burst(store: FileGhostStore<Data>): Promise<void> {
  for (let i = 1; i <= 50; i++) {
    await store.put('k' + i, 1, { n: i });
  }
}

async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 2500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) {
      throw new Error('condition not met within ' + timeoutMs + 'ms');
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

// True when, across the whole 350 ms after the flush, ghosts-note.json kept
// the mtimeMs it had right after the flush and no temp file ever appeared.
async function writtenOnceAfterFlush(dir: string): Promise<boolean> {
  const file = join(dir, 'ghosts-note.json');
  const mtimeAfterFlush = statSync(file).mtimeMs;
  const deadline = Date.now() + 350;
  while (Date.now() < deadline) {
    if (statSync(file).mtimeMs !== mtimeAfterFlush) return false;
    if (readdirSync(dir).some((f) => f.endsWith('.tmp'))) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return statSync(file).mtimeMs === mtimeAfterFlush && !readdirSync(dir).some((f) => f.endsWith('.tmp'));
}

describe('T159 Ghost store: a burst of writes becomes one file write', () => {
  let dir: string;

  function fresh(): FileGhostStore<Data> {
    return new FileGhostStore<Data>(dir, 'note');
  }

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN the burst has run THEN right away fresh() has k1 at version 1 and k50 at version 0 (not on disk yet); 300 ms later fresh() has k50 at version 1 and k25 with data { n: 25 }", async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-batch-'));
    const store = new FileGhostStore<Data>(dir, 'note');
    await burst(store);

    // Right away: only the first put has reached the disk.
    expect((await fresh().get('k1')).version).toBe(1);
    expect((await fresh().get('k50')).version).toBe(0);

    // Once the single coalesced write lands, the whole burst is there.
    // The write is scheduled 100 ms after the first write on disk, so by
    // ~300 ms from the start of the burst it is certainly on disk.
    await eventually(async () => (await fresh().get('k50')).version === 1);
    const f = fresh();
    expect((await f.get('k50')).version).toBe(1);
    expect((await f.get('k25')).data).toEqual({ n: 25 });
  });

  it("2: WHEN the burst has run and await store.setChangeVersion('cv5') resolves THEN right away fresh() has the change version cv5 and k50 at version 1", async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-batch-'));
    const store = new FileGhostStore<Data>(dir, 'note');
    await burst(store);
    await store.setChangeVersion('cv5');

    const f = fresh();
    expect(await f.getChangeVersion()).toBe('cv5');
    expect((await f.get('k50')).version).toBe(1);
  });

  it("3: WHEN the burst has run and await store.remove('k2') resolves THEN right away fresh() has k2 at version 0, k50 at version 1 and k1 at version 1", async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-batch-'));
    const store = new FileGhostStore<Data>(dir, 'note');
    await burst(store);
    await store.remove('k2');

    const f = fresh();
    expect((await f.get('k2')).version).toBe(0);
    expect((await f.get('k50')).version).toBe(1);
    expect((await f.get('k1')).version).toBe(1);
  });

  it('4: WHEN the burst has run and await store.flush() resolves THEN right away fresh() has k50 at version 1, and 300 ms later fs.statSync of ghosts-note.json has the same mtimeMs as right after the flush, and no file ends in .tmp', async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-batch-'));
    const store = new FileGhostStore<Data>(dir, 'note');
    await burst(store);
    await store.flush();

    expect((await fresh().get('k50')).version).toBe(1);
    expect(await writtenOnceAfterFlush(dir)).toBe(true);
  });

  it("5: WHEN the burst has run and the dir is wiped at once (rmSync recursive, then mkdirSync) THEN 300 ms later fs.readdirSync(dir) has length 0 and the store's own get('k50') still resolves version 1 (memory is intact)", async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-batch-'));
    const store = new FileGhostStore<Data>(dir, 'note');
    await burst(store);

    // Logout wipes the data dir and re-creates it empty.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);

    await new Promise((r) => setTimeout(r, 300));
    expect(readdirSync(dir)).toHaveLength(0);
    expect((await store.get('k50')).version).toBe(1);
  });

  it("6: WHEN one put('a', 1, { x: 1 }) runs, 150 ms pass, and one put('b', 1, { x: 2 }) runs THEN right after each put fresh() already has that key at version 1 (single writes are not delayed)", async () => {
    dir = mkdtempSync(join(tmpdir(), 'snote-batch-'));
    const store = new FileGhostStore<Data>(dir, 'note');

    await store.put('a', 1, { x: 1 });
    expect((await fresh().get('a')).version).toBe(1);

    await new Promise((r) => setTimeout(r, 150));

    await store.put('b', 1, { x: 2 });
    expect((await fresh().get('b')).version).toBe(1);
  });
});
