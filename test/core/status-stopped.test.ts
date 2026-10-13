/**
 * T518 (F177): on a clean quit the status file snote leaves makes the
 * bar say "snote is not running" at once — `alive` becomes the epoch —
 * while every other key survives untouched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { STOPPED_ALIVE } from '../../src/core/status-file';

const SYNCED = '2023-11-14T22:13:20.000Z';
const TWO_DAYS = 2 * 86400000;

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

// The BarWidget.qml tooltip formatter, evaluated in node exactly the
// way test/core/status-heartbeat.test.ts does it.
function formatTooltip(): (s: unknown, n: number, b: string) => string {
  const text = readFileSync(path.join(process.cwd(), 'BarWidget.qml'), 'utf8');
  const a = text.indexOf('// tooltip-format:begin');
  const b = text.indexOf('// tooltip-format:end');
  return new Function(text.slice(a, b) + '\nreturn formatTooltip;')() as never;
}

// One live snote per test: the fake server holding 2 notes, a
// buildStore against a private data dir, and the status file path.
interface Rig {
  dir: string;
  file: string;
  server: FakeSimperiumServer;
  stopSaving: () => void;
}

async function startRig(): Promise<Rig> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-stopped-'));
  const server = new FakeSimperiumServer();
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

  const statusDirPath = path.join(dir, 'statusdir');
  fs.mkdirSync(statusDirPath);

  const built = buildStore(
    {
      dataDir: dir,
      appId: 'test-app',
      server: server.url,
      noteEditDelayMs: 10,
      statusDir: statusDirPath,
      statusDelayMs: 20,
    },
    { email: 'test@example.com', token: 'test-token' },
    vi.fn()
  );
  return { dir, file: path.join(statusDirPath, 'status.json'), server, stopSaving: built.stopSaving };
}

const stopRig = async (rig: Rig | undefined): Promise<void> => {
  if (!rig) {
    return;
  }
  rig.stopSaving();
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      rig.server.stop();
      resolve();
    }, 100);
  });
  fs.rmSync(rig.dir, { recursive: true, force: true });
};

describe('T518 a clean quit tells the bar at once', () => {
  it('1: WHEN the file was polled to `count` `2` with a string `synced` and a running `alive` THEN after `stopSaving()` its `alive` is `1970-01-01T00:00:00.000Z`, `count` is `2`, `synced` is unchanged, the keys are `alive`, `count`, `last`, `synced`, `version`, and the status dir holds only `status.json`', async () => {
    let rig: Rig | undefined;
    try {
      rig = await startRig();
      const { file } = rig;

      await waitFor(() => {
        const s = readStatus(file);
        return (
          s !== null &&
          s.count === 2 &&
          typeof s.synced === 'string' &&
          Date.now() - Date.parse(String(s.alive)) <= 120000
        );
      });
      const syncedBefore = readStatus(file)!.synced;

      rig.stopSaving();

      await waitFor(() => {
        const s = readStatus(file);
        return (
          s !== null &&
          s.alive === STOPPED_ALIVE &&
          s.count === 2 &&
          s.synced === syncedBefore &&
          Object.keys(s).sort().join(',') === 'alive,count,last,synced,version' &&
          fs.readdirSync(path.dirname(file)).join(',') === 'status.json'
        );
      });
      const final = readStatus(file)!;
      expect(final.alive).toBe('1970-01-01T00:00:00.000Z');
      expect(final.count).toBe(2);
      expect(final.synced).toBe(syncedBefore);
      expect(Object.keys(final).sort()).toEqual(['alive', 'count', 'last', 'synced', 'version']);
      expect(fs.readdirSync(path.dirname(file))).toEqual(['status.json']);
    } finally {
      await stopRig(rig);
    }
  });

  it('2: WHEN the running file is read at the current time by the `BarWidget.qml` tooltip function THEN the text contains `Synced` and not `not running`; WHEN the stopped file is read THEN it contains `snote is not running · last synced` and not `Synced`', async () => {
    let rig: Rig | undefined;
    try {
      rig = await startRig();
      const { file } = rig;

      await waitFor(() => {
        const s = readStatus(file);
        const text = s === null ? '' : formatTooltip()(s, Date.now(), 'x');
        return (
          s !== null &&
          s.count === 2 &&
          typeof s.synced === 'string' &&
          text.includes('Synced') &&
          !text.includes('not running')
        );
      });
      const runningText = formatTooltip()(readStatus(file)!, Date.now(), 'x');
      expect(runningText).toContain('Synced');
      expect(runningText).not.toContain('not running');

      rig.stopSaving();

      await waitFor(() => {
        const s = readStatus(file);
        const text = s === null ? '' : formatTooltip()(s, Date.now(), 'x');
        return (
          s !== null &&
          s.alive === STOPPED_ALIVE &&
          text.includes('snote is not running · last synced') &&
          !text.includes('Synced')
        );
      });
      const stoppedText = formatTooltip()(readStatus(file)!, Date.now(), 'x');
      expect(stoppedText).toContain('snote is not running · last synced');
      expect(stoppedText).not.toContain('Synced');
    } finally {
      await stopRig(rig);
    }
  });

  it("3: WHEN an old-format file `{ count: 1, last: null, synced: '2023-11-14T22:13:20.000Z' }` with no `alive` is read two days later THEN the tooltip says `Synced 2d ago` and not `not running`", () => {
    const out = formatTooltip()(
      { count: 1, last: null, synced: SYNCED },
      Date.parse(SYNCED) + TWO_DAYS,
      'x'
    );
    expect(out).toContain('Synced 2d ago');
    expect(out).not.toContain('not running');
  });

  it("4: WHEN a second `buildStore` on the same data dir throws `another snote is already using` while the first runs THEN the file's `alive` is still not `1970-01-01T00:00:00.000Z`; after the first `stopSaving()` it is `1970-01-01T00:00:00.000Z`", async () => {
    let rig: Rig | undefined;
    try {
      rig = await startRig();
      const { file, dir } = rig;

      await waitFor(() => {
        const s = readStatus(file);
        return s !== null && s.count === 2 && s.alive !== STOPPED_ALIVE;
      });

      let message = '';
      try {
        buildStore(
          {
            dataDir: dir,
            appId: 'test-app',
            server: rig.server.url,
            noteEditDelayMs: 10,
            statusDir: path.dirname(file),
            statusDelayMs: 20,
          },
          { email: 'test@example.com', token: 'test-token' },
          vi.fn()
        );
      } catch (err) {
        message = String((err as Error).message);
      }
      expect(message).toContain('another snote is already using');

      const refused = readStatus(file)!;
      expect(refused.alive).not.toBe('1970-01-01T00:00:00.000Z');
      expect(refused.count).toBe(2);

      rig.stopSaving();

      await waitFor(() => {
        const s = readStatus(file);
        return s !== null && s.alive === STOPPED_ALIVE && s.count === 2;
      });
      expect(readStatus(file)!.alive).toBe('1970-01-01T00:00:00.000Z');
    } finally {
      await stopRig(rig);
    }
  });
});
