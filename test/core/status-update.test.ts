/**
 * T388: status.json carries the update state for the bar.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { buildStatus, watchStatus } from '../../src/core/status-file';
import { publishUpdate, resetUpdateSignal } from '../../src/core/update-signal';

import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

// Poll a condition with a 10 ms step so a late timer only makes a
// test slower, never red. EVERY asserted value sits inside the poll.
const waitFor = async (cond: () => boolean, timeoutMs = 1000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
};

const readStatus = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const seedStore = (count: number) => {
  const store = makeStore({ stubClient: {} });
  for (let i = 1; i <= count; i++) {
    const id = `n${i}`;
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(id),
      note: {
        content: 'Note ' + id,
        deleted: false,
        modificationDate: i * 1000,
        creationDate: i * 1000 - 1,
        systemTags: [],
        tags: [],
      },
    } as never);
  }
  return store;
};

describe('T388 status update key', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-status-update-'));
  });

  afterEach(() => {
    resetUpdateSignal();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN buildStatus runs on a store with 3 live notes, `null` synced and the signal `{ kind: 'available' }` THEN `update` is `'available'`, `count` is `3` and `synced` is `null`", () => {
    const state = seedStore(3).getState();

    const status = buildStatus(state, null, { kind: 'available' });

    expect(status.update).toBe('available');
    expect(status.count).toBe(3);
    expect(status.synced).toBe(null);
  });

  it("2: WHEN it runs with the signal `{ kind: 'restart', available: '0.2.3' }` THEN `update` is `'restart'`", () => {
    const state = seedStore(3).getState();

    const status = buildStatus(state, null, { kind: 'restart', available: '0.2.3' });

    expect(status.update).toBe('restart');
  });

  it("3: WHEN it runs with no third argument, and again with `null` THEN `'update' in status` is `false` and `Object.keys(status).sort()` equals `['count', 'last', 'synced', 'version']`", () => {
    const state = seedStore(3).getState();

    const noArg = buildStatus(state, null);
    expect('update' in noArg).toBe(false);
    expect(Object.keys(noArg).sort()).toEqual(['count', 'last', 'synced', 'version']);

    const withNull = buildStatus(state, null, null);
    expect('update' in withNull).toBe(false);
    expect(Object.keys(withNull).sort()).toEqual(['count', 'last', 'synced', 'version']);
  });

  it("4: WHEN watchStatus(store, dir, { delayMs: 10 }) runs and then `publishUpdate({ kind: 'available' })` THEN, polled up to 1 s, `status.json` parses with `update` equal to `'available'`", async () => {
    const store = seedStore(1);
    const file = path.join(tmpDir, 'status.json');

    const stop = watchStatus(store, tmpDir, { delayMs: 10 });
    publishUpdate({ kind: 'available' });

    await waitFor(() => readStatus(file)?.update === 'available');
    expect(readStatus(file)!.update).toBe('available');

    stop();
  });

  it("5: WHEN `publishUpdate({ kind: 'restart', available: '0.2.3' })` ran BEFORE `watchStatus` started THEN, polled, the file has `update` equal to `'restart'`", async () => {
    const store = seedStore(1);
    const file = path.join(tmpDir, 'status.json');

    publishUpdate({ kind: 'restart', available: '0.2.3' });
    const stop = watchStatus(store, tmpDir, { delayMs: 10 });

    await waitFor(() => readStatus(file)?.update === 'restart');
    expect(readStatus(file)!.update).toBe('restart');

    stop();
  });

  it("6: WHEN stop() has run and a different signal is then published THEN after 200 ms `status.json` still has the earlier `update` value (`'available'`)", async () => {
    const store = seedStore(1);
    const file = path.join(tmpDir, 'status.json');

    const stop = watchStatus(store, tmpDir, { delayMs: 10 });
    publishUpdate({ kind: 'available' });
    await waitFor(() => readStatus(file)?.update === 'available');

    stop();
    publishUpdate({ kind: 'restart', available: '0.2.3' });

    await new Promise((r) => setTimeout(r, 200));
    expect(readStatus(file)!.update).toBe('available');
  });
});
