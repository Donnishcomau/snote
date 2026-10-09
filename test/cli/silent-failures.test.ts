/**
 * T443: fire-and-forget start-up failures (requeue, resend, force-sync
 * steps) publish a notice instead of vanishing into `.catch(() => {})`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import {
  currentProblem,
  resetProblemSignal,
} from '../../src/core/problem-signal';

const waitFor = async (cond: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const TOMBSTONES = '["gone1"]';
const GHOSTS =
  '{"version":1,"cv":"5","ghosts":[{"key":"gone1","version":3,"data":{"content":"x"}}]}';

describe('T443 silent start-up failures show a notice', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  beforeEach(async () => {
    resetProblemSignal();
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t443-'));
    fs.writeFileSync(path.join(dir, 'tombstones.json'), TOMBSTONES);
    fs.writeFileSync(path.join(dir, 'ghosts-note.json'), GHOSTS);
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const build = () => {
    const result = buildStore(
      {
        dataDir: dir,
        appId: 'test-app',
        server: server.url,
        noteEditDelayMs: 10,
      },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn()
    );
    stopSaving = result.stopSaving;
    return result;
  };

  it('1: WHEN buildStore runs on a dir holding the tombstone fixture and a `tombstones.json.tmp` directory THEN within 2 s `currentProblem()` is `could not re-send deletions: EISDIR`', async () => {
    fs.mkdirSync(path.join(dir, 'tombstones.json.tmp'));
    build();

    let seen: string | null = null;
    await waitFor(() => {
      const value = currentProblem();
      if (value !== null) {
        seen = value;
      }
      return seen === 'could not re-send deletions: EISDIR';
    });

    expect(seen).toBe('could not re-send deletions: EISDIR');
  });

  it('2: WHEN buildStore runs on the same fixture without the `tombstones.json.tmp` directory THEN after 500 ms `currentProblem()` is `null`', async () => {
    build();

    await new Promise((r) => setTimeout(r, 500));

    expect(currentProblem()).toBeNull();
  });

  it('3: WHEN src/cli/main.tsx is read THEN the text from `void requeueUnsynced(` to `trackDeletions(store` contains `could not re-send offline edits` and no `() => {}`', () => {
    const src = read('src/cli/main.tsx');
    const from = src.indexOf('void requeueUnsynced(');
    const to = src.indexOf('trackDeletions(store');
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const slice = src.slice(from, to);
    expect(slice).toContain('could not re-send offline edits');
    expect(slice).not.toContain('() => {}');
  });

  it('4: WHEN src/cli/main.tsx is read THEN the text from `void resendDeletions(` to `return { store` contains `could not re-send deletions` and no `() => {}`', () => {
    const src = read('src/cli/main.tsx');
    const from = src.indexOf('void resendDeletions(');
    const to = src.indexOf('return { store');
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const slice = src.slice(from, to);
    expect(slice).toContain('could not re-send deletions');
    expect(slice).not.toContain('() => {}');
  });

  it('5: WHEN src/core/store.ts is read THEN it contains `force sync failed` and `could not re-send a pending note`, and no `.catch(() => {})`', () => {
    const src = read('src/core/store.ts');
    expect(src).toContain('force sync failed');
    expect(src).toContain('could not re-send a pending note');
    expect(src).not.toContain('.catch(() => {})');
  });
});
