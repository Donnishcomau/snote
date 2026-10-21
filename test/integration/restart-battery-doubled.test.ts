/**
 * R1 restart battery guard (REQUIRED-LINES section D): these scenarios double
 * on cacc247 (text lands twice, nothing lost). Target KEPT; a change that turns
 * any of them into LOST or STUCK fails (stop rule 3). A sync brief that makes
 * one KEPT moves it to restart-battery-kept.test.ts.
 * T531-P3 and D1-6 are guarded (not LOST, plus more) in restart-battery-kept.test.ts.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

// sync-4 (#28) made T531-P4, T531-P5, DBL-S9-01 pin/edit/trash, D1-3 and D1-4
// KEPT, and sync-5 (#27) S11-01-Q1-pin: they moved to
// restart-battery-kept.test.ts. B 9-10 still double (the echo arrives in the
// same frame as another device's change); the kept file also checks they keep
// OTHER and the pin.
const NEVER_LOST = ['T531-P3-other-device-pin', 'D1-6-other-device-pin'];

describe('restart battery: a doubling never becomes a loss', () => {
  for (const id of NEVER_LOST) {
    it(`${id} is KEPT or DOUBLED`, async () => {
      const o = await runScenario(id);
      expect(['KEPT', 'DOUBLED']).toContain(o.verdict);
    }, 45000);
  }
});
