/**
 * T417: quitting snote (the stopSaving buildStore returns) removes the
 * update notice from the bar's status file, keeping every other key.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { publishUpdate, resetUpdateSignal } from '../../src/core/update-signal';

// Poll a condition with a 10 ms step so a late timer only makes a
// test slower, never red. EVERY asserted value sits inside the poll.
const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
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

describe('T417 quit clears the update notice', () => {
  let tmpDir: string;
  let server: FakeSimperiumServer | undefined;
  let stopSaving: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-quit-'));
  });

  afterEach(async () => {
    resetUpdateSignal();
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

  // The fake server holds exactly 2 notes; buildStore syncs them in.
  const startWithTwoNotes = async (): Promise<string> => {
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
    return path.join(statusDirPath, 'status.json');
  };

  it("1: WHEN buildStore runs with a status dir against the fake server holding 2 notes, `publishUpdate({ kind: 'available' })` ran and the file was polled to `update` `available` THEN after `stopSaving()` the file has no `update` key and `count` is still `2`", async () => {
    const file = await startWithTwoNotes();

    publishUpdate({ kind: 'available' });
    await waitFor(
      () => readStatus(file)?.update === 'available' && readStatus(file)?.count === 2,
      2500
    );
    expect(readStatus(file)!.update).toBe('available');
    expect(readStatus(file)!.count).toBe(2);

    const stop = stopSaving!;
    stopSaving = undefined;
    stop();

    await waitFor(() => {
      const s = readStatus(file);
      return s !== null && !('update' in s) && s.count === 2;
    });
    const final = readStatus(file)!;
    expect('update' in final).toBe(false);
    expect(final.count).toBe(2);
  });

  it("2: WHEN the same runs with `{ kind: 'restart', available: '0.2.5' }` THEN after `stopSaving()` the file has no `update` key", async () => {
    const file = await startWithTwoNotes();

    publishUpdate({ kind: 'restart', available: '0.2.5' });
    await waitFor(() => readStatus(file)?.update === 'restart');
    expect(readStatus(file)!.update).toBe('restart');

    const stop = stopSaving!;
    stopSaving = undefined;
    stop();

    await waitFor(() => {
      const s = readStatus(file);
      return s !== null && !('update' in s);
    });
    expect('update' in readStatus(file)!).toBe(false);
  });

  it("3: WHEN no signal was published and the file was polled to `count` `2` THEN after `stopSaving()` its keys are exactly `count`, `last`, `synced`, `version` and `count` is `2`", async () => {
    const file = await startWithTwoNotes();

    await waitFor(() => readStatus(file)?.count === 2);
    expect(readStatus(file)!.count).toBe(2);

    const stop = stopSaving!;
    stopSaving = undefined;
    stop();

    await waitFor(() => {
      const s = readStatus(file);
      return (
        s !== null &&
        Object.keys(s).sort().join(',') === 'alive,count,last,synced,version' &&
        s.count === 2
      );
    });
    const final = readStatus(file)!;
    expect(Object.keys(final).sort()).toEqual(['alive', 'count', 'last', 'synced', 'version']);
    expect(final.count).toBe(2);
  });
});
