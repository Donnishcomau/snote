/**
 * T364: every status write is best-effort and stop() flushes only a
 * pending write, so the optional bar status can never crash snote.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeStore } from '../../src/core/store';
import { watchStatus } from '../../src/core/status-file';

import type { EntityId } from '@vendor/types';
import type { Status } from '../../src/core/status-file';

const eid = (id: string): EntityId => id as unknown as EntityId;

// Poll a condition with a 10 ms step so a late timer only makes a test
// slower, never red. EVERY asserted value sits inside the poll condition.
const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
};

const readStatus = (file: string): Status | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Status;
  } catch {
    return null;
  }
};

const seedNote = (
  store: ReturnType<typeof makeStore>,
  id: string,
  modified: number
) => {
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid(id),
    note: {
      content: 'Note ' + id,
      deleted: false,
      modificationDate: modified,
      creationDate: modified - 1,
      systemTags: [],
      tags: [],
    },
  } as never);
};

describe('T364 status writes are safe', () => {
  let tmpDir: string;
  let uncaught: unknown[] = [];
  const uncaughtHandler = (err: unknown) => {
    uncaught.push(err);
  };
  let stop: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-safe-'));
    uncaught = [];
    process.on('uncaughtException', uncaughtHandler);
  });

  afterEach(() => {
    process.off('uncaughtException', uncaughtHandler);
    stop?.();
    stop = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1: WHEN `watchStatus(store, dir, { delayMs: 20 })` runs with `dir` below a regular file and a note is created THEN after `100` ms no uncaught exception was seen and `stop()` does not throw', async () => {
    const store = makeStore({ stubClient: {} });
    const blocker = path.join(tmpDir, 'afile');
    fs.writeFileSync(blocker, 'not a directory');
    const dir = path.join(blocker, 'status');

    const stopWatch = watchStatus(store, dir, { delayMs: 20 });
    stop = stopWatch;

    seedNote(store, 'n1', 1000);

    // Poll: no uncaught exception across at least 100 ms of timer fire.
    const start = Date.now();
    await waitFor(() => uncaught.length === 0 && Date.now() - start >= 100);
    expect(uncaught).toEqual([]);
    expect(() => stopWatch()).not.toThrow();
    stop = undefined;
  });

  it('2: WHEN `watchStatus` runs on a writable temp dir with `delayMs` `20` and the file has been written, then `status.json` is deleted and `stop()` is called with nothing pending THEN `status.json` still does not exist', async () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, 'n1', 1000);

    const stopWatch = watchStatus(store, tmpDir, { delayMs: 20 });
    stop = stopWatch;
    const file = path.join(tmpDir, 'status.json');

    await waitFor(() => fs.existsSync(file));
    fs.rmSync(file);

    stopWatch();
    stop = undefined;
    expect(fs.existsSync(file)).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(file)).toBe(false);
  });

  it('3: WHEN a note is created and `stop()` is called at once on a writable temp dir THEN `status.json` exists and parses with `count` `1`', () => {
    const store = makeStore({ stubClient: {} });

    const stopWatch = watchStatus(store, tmpDir, { delayMs: 20 });
    const file = path.join(tmpDir, 'status.json');

    seedNote(store, 'n1', 1000);
    stopWatch();
    stop = undefined;

    expect(fs.existsSync(file)).toBe(true);
    expect(readStatus(file)!.count).toBe(1);
  });
});
