/**
 * R1 restart battery guard (REQUIRED-LINES sections B and C): every scenario
 * here is KEPT on cacc247 and must stay KEPT through the 0.2.8 sync redesign.
 * Rows 9 and 10 are DOUBLED today: they must keep the other device's `OTHER`
 * and the pin with nothing pending. A sync brief may add rows, never remove one.
 * T531-P2 (trash and delete forever at once after a restart) was left out
 * while it was LOST under parallel load (F226); sync-6 (#93) adds it back.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const KEPT = [
  // B 11-14: the undo of an offline pin, trash or tag before the catch-up (F202).
  'S12-01-O1-unpin',
  'S12-01-O2-unpin',
  'S12-01-O3-restore',
  'S12-01-O4-untag',
  // C: kept on 0.2.6.
  'S8-01-edit',
  'S8-01-trash',
  'S10-01-P6',
  'S10-01-P8',
  'S11-01-Q9-pin-400',
  'S11-01-Q9-pin-1500',
  'S11-01-Q9-trash-400',
  'S11-01-Q9-tag-400',
  'S11-01-Q8-pin-0',
  'S11-01-Q8-trash-0',
  'S11-01-Q8-tag-0',
  'DBL-quit-before-ack',
  'F198-inline-50',
  'F198-inline-300',
  'F198-external-300',
  'F198-never-got-it-300',
  'F198-hold-300',
  'F198-inline-900',
  // D, KEPT since sync-4 (#28): an action just after a restart.
  'T531-P4-offline-pin',
  'T531-P5-two-offline-then-pin',
  'DBL-S9-01-pin',
  'DBL-S9-01-edit',
  'DBL-S9-01-trash',
  'D1-3-edit',
  'D1-4-pin',
  // KEPT since sync-6 (#93, F226): delete forever just after a restart.
  'T531-P2-delete-forever',
  'S226-forever-late-echo',
  // KEPT since sync-5 (#27): the catch-up after the 4 s fallback; a save
  // queued behind an unconfirmed one, also after a re-index (#20).
  'S11-01-Q1-pin',
  'S27-two-saves',
  'S20-reindex-two-saves',
  // KEPT since sync-5b (#27, F236): another device's count-neutral change
  // (a move, an added blank line) made while snote was closed with an offline
  // edit is not reverted by the start-up hand-off.
  'F236-move',
  'F236-move-reindex',
  'F236-blank',
  'F236-blank-reindex',
];

describe('restart battery: kept stays kept', () => {
  for (const id of KEPT) {
    it(`${id} is KEPT`, async () => {
      const o = await runScenario(id);
      expect({ id, verdict: o.verdict }).toEqual({ id, verdict: 'KEPT' });
    }, 45000);
  }

  // B 9-10: lost only by the reverted design (df5272d).
  for (const id of ['T531-P3-other-device-pin', 'D1-6-other-device-pin']) {
    it(`${id} keeps OTHER and the pin with nothing pending`, async () => {
      const o = await runScenario(id);
      expect(o.verdict).not.toBe('LOST');
      expect(o.server?.content).toContain('OTHER');
      expect(o.store?.content).toContain('OTHER');
      expect(o.server?.systemTags).toContain('pinned');
      expect(o.store?.systemTags).toContain('pinned');
      expect(o.pending).toBe(0);
    }, 45000);
  }
});
