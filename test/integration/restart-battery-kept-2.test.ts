/**
 * R1 restart battery guard, part 2 of 5 (split from restart-battery-kept.test.ts, #369):
 * scenarios that are KEPT and must stay KEPT; see the header of that file.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const KEPT = [
  'Q8-pin-0',
  'Q8-trash-0',
  'Q8-tag-0',
  'DBL-quit-before-ack',
  'kill-inline-50',
  'kill-inline-300',
  'kill-external-300',
  'kill-never-got-it-300',
  'kill-hold-300',
  'kill-inline-900',
  // D, KEPT since sync-4 (#28): an action just after a restart.
  'P4-offline-pin',
  'P5-two-offline-then-pin',
  'DBL-restart-pin',
  'DBL-restart-edit',
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
