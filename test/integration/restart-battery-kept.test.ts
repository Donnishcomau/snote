/**
 * R1 restart battery guard (REQUIRED-LINES sections B and C): every scenario
 * here is KEPT on cacc247 and must stay KEPT through the 0.2.8 sync redesign.
 * Rows 9 and 10 are DOUBLED today: they must keep the other device's `OTHER`
 * and the pin with nothing pending. A sync brief may add rows, never remove one.
 * P2-delete-forever (trash and delete forever at once after a restart) was left out
 * while it was LOST under parallel load; sync-6 (#93) adds it back.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const KEPT = [
  // B 11-14: the undo of an offline pin, trash or tag before the catch-up.
  'O1-unpin',
  'O2-unpin',
  'O3-restore',
  'O4-untag',
  // C: kept on 0.2.6.
  'crash-before-save-edit',
  'crash-before-save-trash',
  'P6-ahead-copy-clean-stop',
  'P8-ahead-copy-pin-crash',
  // #130: the same with a re-index start.
  'P6-ahead-copy-clean-stop-reindex',
  'P8-ahead-copy-pin-crash-reindex',
  'Q9-pin-400',
  'Q9-pin-1500',
  'Q9-trash-400',
  'Q9-tag-400',
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
