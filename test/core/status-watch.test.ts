/**
 * T358: watchStatus keeps status.json fresh (debounced) and logout removes it.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore } from '../../src/core/store';
import { buildStore } from '../../src/cli/main';
import { statusDir, watchStatus, removeStatusFile } from '../../src/core/status-file';

import type { EntityId } from '@vendor/types';
import type { State } from '../../src/core/store';

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

const readStatus = (
  file: string
): { count: number; synced: string | null } | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
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

describe('T358 status watch', () => {
  let tmpDir: string;
  let server: FakeSimperiumServer | undefined;
  let stopSaving: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-watch-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    if (server) {
      const s = server;
      server = undefined;
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          s.stop();
          resolve();
        }, 100);
      });
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN `statusDir` gets `{ SNOTE_STATUS_DIR: '/x/s' }`, `{ XDG_DATA_HOME: '/x/d' }`, `{ HOME: '/h' }` THEN it returns `/x/s`, `/x/d/omarchy-snote-plugin` and `/h/.local/share/omarchy-snote-plugin`", () => {
    expect(statusDir({ SNOTE_STATUS_DIR: '/x/s' })).toBe('/x/s');
    expect(statusDir({ XDG_DATA_HOME: '/x/d' })).toBe('/x/d/omarchy-snote-plugin');
    expect(statusDir({ HOME: '/h' })).toBe('/h/.local/share/omarchy-snote-plugin');
  });

  it('2: WHEN watchStatus(store, dir, { delayMs: 100 }) is active with 1 note and 3 more are created back-to-back THEN right after the dispatches status.json does not exist, and then the file parses with count 4', async () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, 'n1', 1000);

    const stop = watchStatus(store, tmpDir, { delayMs: 100 });
    const file = path.join(tmpDir, 'status.json');

    seedNote(store, 'n2', 2000);
    seedNote(store, 'n3', 3000);
    seedNote(store, 'n4', 4000);

    expect(fs.existsSync(file)).toBe(false);

    await waitFor(() => readStatus(file)?.count === 4);
    expect(readStatus(file)!.count).toBe(4);

    stop();
  });

  it("3: WHEN watchStatus(..., { delayMs: 20, now: () => 1700000000000 }) runs on a disconnected store THEN the file shows synced `null`; after CHANGE_CONNECTION_STATUS green it shows synced 2023-11-14T22:13:20.000Z", async () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, 'n1', 1000);

    const stop = watchStatus(store, tmpDir, {
      delayMs: 20,
      now: () => 1700000000000,
    });
    const file = path.join(tmpDir, 'status.json');

    await waitFor(() => readStatus(file)?.synced === null);
    expect(readStatus(file)!.synced).toBe(null);

    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as never);

    await waitFor(() => readStatus(file)?.synced === '2023-11-14T22:13:20.000Z');
    expect(readStatus(file)!.synced).toBe('2023-11-14T22:13:20.000Z');

    stop();
  });

  it('4: WHEN a note is created and stop() is called at once THEN status.json exists with the new count immediately; a note created after stop() is not written (count unchanged 250 ms later)', async () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, 'n1', 1000);

    const stop = watchStatus(store, tmpDir, { delayMs: 100 });
    const file = path.join(tmpDir, 'status.json');

    seedNote(store, 'n2', 2000);
    stop();

    expect(readStatus(file)?.count).toBe(2);

    seedNote(store, 'n3', 3000);
    await new Promise((r) => setTimeout(r, 250));
    expect(readStatus(file)?.count).toBe(2);
  });

  it('5: WHEN buildStore runs with statusDir set to a temp directory and statusDelayMs 20 against the fake server holding 2 notes THEN the file parses with count 2 within the poll', async () => {
    server = new FakeSimperiumServer();
    await server.start();
    const now = Date.now();
    server.seedBucket('test-app', 'note', [
      {
        id: 'note1',
        data: {
          content: 'First',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note2',
        data: {
          content: 'Second',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    const statusDirPath = path.join(tmpDir, 'statusdir');
    fs.mkdirSync(statusDirPath);

    const built = buildStore(
      {
        dataDir: tmpDir,
        appId: 'test-app',
        server: server.url,
        noteEditDelayMs: 10,
        statusDir: statusDirPath,
        statusDelayMs: 20,
      },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn()
    );
    stopSaving = built.stopSaving;

    const file = path.join(statusDirPath, 'status.json');
    await waitFor(() => readStatus(file)?.count === 2);
    expect(readStatus(file)!.count).toBe(2);
  });

  it('6: WHEN a status.json exists in statusDir and buildStore runs with token bad-token THEN once onLogout was called the file no longer exists', async () => {
    server = new FakeSimperiumServer();
    await server.start();

    const statusDirPath = path.join(tmpDir, 'statusdir');
    fs.mkdirSync(statusDirPath);
    const file = path.join(statusDirPath, 'status.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, count: 1, last: null, synced: null }));

    const onLogout = vi.fn();
    const built = buildStore(
      {
        dataDir: tmpDir,
        appId: 'test-app',
        server: server.url,
        noteEditDelayMs: 10,
        statusDir: statusDirPath,
        statusDelayMs: 20,
      },
      { email: 'test@example.com', token: 'bad-token' },
      onLogout
    );
    stopSaving = built.stopSaving;

    await waitFor(
      () => onLogout.mock.calls.length >= 1 && !fs.existsSync(file)
    );
    expect(onLogout).toHaveBeenCalled();
    expect(fs.existsSync(file)).toBe(false);
  });
});
