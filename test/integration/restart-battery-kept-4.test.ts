/**
 * R1 restart battery guard, part 4 of 5 (split from restart-battery-kept.test.ts, #369):
 * scenarios that are KEPT and must stay KEPT; see the header of that file.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const KEPT = [
  'count-neutral-blank-reindex',
  // KEPT since sync-7: an offline edit that only moves a
  // line; a line another device moved to where the offline copy inserted the
  // same line (re-index start; with a prompt start see the doubled guard);
  // after a re-index, an offline deletion of a line another device moved (up
  // or down) loses no other line and the moved line stays; another device's
  // deletion of one of two equal lines stays deleted. with a prompt start
  // is sync-8 (the library's own catch-up rebase drops the line).
  'offline-move',
  'offline-move-reindex',
  'coincident-line-reindex',
  'coincident-blank-reindex',
  'delete-moved-reindex',
  'delete-moved-down-reindex',
  'REPDEL-reindex',
  'dup-line-reindex',
  'dup-blank-reindex',
  // KEPT since sync-8 (#115): the hand-off is the one merge for a held note and
  // never loses text (else both versions are kept): with a prompt
  // start, an offline move plus another device's append, a same-line conflict;
  // and P6 with the catch-up after the rig's wait.
  'delete-moved',
  'delete-moved-down',
  'coincident-line',
  'MOVEAPP',
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
