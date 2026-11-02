/**
 * R1 restart battery guard (REQUIRED-LINES section D): these scenarios double
 * on cacc247 (text lands twice, nothing lost). Target KEPT; a change that turns
 * any of them into LOST or STUCK fails (stop rule 3). A sync brief that makes
 * one KEPT moves it to restart-battery-kept.test.ts.
 * P3-other-device-pin and late-catch-up-other-device-pin are guarded (not LOST, plus more) in restart-battery-kept.test.ts.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

// sync-4 (#28) made P4-offline-pin, P5-two-offline-then-pin, DBL-restart pin/edit/trash,
// late-catch-up-edit and late-catch-up-pin KEPT, and sync-5 (#27) Q1-pin: they moved to
// restart-battery-kept.test.ts. B 9-10 still double (the echo arrives in the
// same frame as another device's change); the kept file also checks they keep
// OTHER and the pin.
// with a prompt start: the sync library's own catch-up rebase lands the
// moved line twice before the hand-off runs (same on 1388c25; nothing lost).
const NEVER_LOST = ['P3-other-device-pin', 'late-catch-up-other-device-pin', 'coincident-line'];

describe('restart battery: a doubling never becomes a loss', () => {
  for (const id of NEVER_LOST) {
    it(`${id} is KEPT or DOUBLED`, async () => {
      const o = await runScenario(id);
      expect(['KEPT', 'DOUBLED']).toContain(o.verdict);
    }, 45000);
  }
});
