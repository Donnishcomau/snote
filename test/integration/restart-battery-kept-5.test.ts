/**
 * R1 restart battery guard, part 5 of 5 (split from restart-battery-kept.test.ts, #369):
 * scenarios that are KEPT and must stay KEPT; see the header of that file.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const KEPT = [
  'MOVEAPP-reindex',
  'CONFLICT-hostile-title',
  'P6-ahead-copy-late',
  // (both starts): a move with an edit, or a whitespace-only edit,
  // against another device's change ends in both versions, nothing lost;
  // (both starts): another device's removal of a line the offline edit repeated
  // stays removed; a session edit made while the note is held is kept.
  'move-edit-append',
  'move-edit-append-reindex',
  'space-move',
  'space-move-reindex',
  'repdel-first',
  'repdel-first-reindex',
  'repdel-last',
  'repdel-last-reindex',
  'HOLD-session-edit',
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

  // B 9-10: lost only by the reverted design (df5272d).
  for (const id of ['P3-other-device-pin', 'late-catch-up-other-device-pin']) {
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
