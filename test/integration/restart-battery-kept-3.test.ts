/**
 * R1 restart battery guard, part 3 of 5 (split from restart-battery-kept.test.ts, #369):
 * scenarios that are KEPT and must stay KEPT; see the header of that file.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const KEPT = [
  'DBL-restart-trash',
  'late-catch-up-edit',
  'late-catch-up-pin',
  // KEPT since sync-6 (#93,): delete forever just after a restart.
  'P2-delete-forever',
  'forever-late-echo',
  // KEPT since sync-6b (#125,): the same with a re-index start, and a
  // tombstone re-sent at a re-index start.
  'forever-reindex',
  'forever-late-reindex',
  'tombstone-resend-reindex',
  // KEPT since sync-5 (#27): the catch-up after the 4 s fallback; a save
  // queued behind an unconfirmed one, also after a re-index (#20).
  'Q1-pin',
  'two-saves',
  'two-saves-reindex',
  // KEPT since sync-5b (#27,): another device's count-neutral change
  // (a move, an added blank line) made while snote was closed with an offline
  // edit is not reverted by the start-up hand-off.
  'count-neutral-move',
  'count-neutral-move-reindex',
  'count-neutral-blank',
];

describe('restart battery: kept stays kept', () => {
  for (const id of KEPT) {
    it(`${id} is KEPT`, async () => {
      const o = await runScenario(id);
      // #130 — the whole outcome is in the comparison, so a red run shows the
      // server and store copies and the pending count, not only the verdict.
      expect({ id, verdict: o.verdict, server: o.server, store: o.store, pending: o.pending }).toMatchObject({ id, verdict: 'KEPT' });
    }, 45000);
  }
});
