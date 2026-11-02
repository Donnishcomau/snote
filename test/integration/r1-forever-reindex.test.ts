/**
 * R1 sync-6b (#125,). A note deleted forever just after a start that must
 * re-index stays deleted: an index page reaches the sync library without the
 * notes tombstones.json names, so it never re-creates one and drops its queued
 * remove; the same holds for a tombstone re-sent at a re-index start. The
 * prompt start (sync-6) keeps passing.
 */
import { afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { withoutTombstoned } from '../../src/core/simperium-tombstone-index-fix';
import { cleanupBattery, runScenario } from './restart-battery-rig';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
afterEach(cleanupBattery);

function dirWith(tombstones?: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'snote-sync6b-'));
  dirs.push(dir);
  if (tombstones) writeFileSync(join(dir, 'tombstones.json'), JSON.stringify(tombstones));
  return dir;
}

const PAGE = JSON.stringify({ index: [{ id: 'n1', v: 4, d: { content: 'x' } }, { id: 'n2', v: 1, d: { content: 'y' } }], current: '7' });

describe('R1 sync-6b: delete forever just after a re-index start stays deleted', () => {
  it('1: WHEN the edit `MK` was sent and not acknowledged, snote quits, restarts with a re-index and the user trashes and deletes n1 forever at once THEN the server and the store hold no n1, verdict `KEPT`', async () => {
    const o = await runScenario('forever-reindex');
    expect(o.server).toBeNull();
    expect(o.store).toBeNull();
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN the same restart with a re-index has its index 1.5 s late THEN the server and the store hold no n1, verdict `KEPT`', async () => {
    const o = await runScenario('forever-late-reindex');
    expect(o.server).toBeNull();
    expect(o.store).toBeNull();
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN n1 is synced, tombstones.json names n1 and snote restarts with a re-index THEN the server and the store hold no n1, verdict `KEPT`', async () => {
    const o = await runScenario('tombstone-resend-reindex');
    expect(o.server).toBeNull();
    expect(o.store).toBeNull();
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN withoutTombstoned gets an index page with n1 and n2 and tombstones.json names n1, and the same page with no tombstones.json THEN the first result lists only `n2` with `current` `7`, and the second is the page unchanged', () => {
    const filtered = JSON.parse(withoutTombstoned(PAGE, dirWith(['n1']))) as { index: Array<{ id: string }>; current: string };
    expect({ ids: filtered.index.map((o) => o.id), current: filtered.current }).toEqual({ ids: ['n2'], current: '7' });
    expect(withoutTombstoned(PAGE, dirWith())).toBe(PAGE);
  });

  it('5: WHEN withoutTombstoned gets `not json`, `{"mark":"m"}` (no index) and `null` with tombstones.json naming n1 THEN each comes back unchanged', () => {
    const dir = dirWith(['n1']);
    expect(['not json', '{"mark":"m"}', 'null'].map((d) => withoutTombstoned(d, dir))).toEqual(['not json', '{"mark":"m"}', 'null']);
  });

  it('6: WHEN the edit `MK` was sent and not acknowledged, snote quits, restarts with a prompt catch-up and the user trashes and deletes n1 forever at once THEN the server and the store hold no n1, verdict `KEPT`', async () => {
    const o = await runScenario('P2-delete-forever');
    expect(o.server).toBeNull();
    expect(o.store).toBeNull();
    expect(o.verdict).toBe('KEPT');
  }, 45000);
});
