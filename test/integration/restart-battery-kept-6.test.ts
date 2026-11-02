/**
 * R1 restart battery guard, part 6 (#336,): a kill shortly after a pin on an
 * unacknowledged edit, and a catch-up reply 3.9 to 6 s late, both end KEPT (the
 * note once, the pin kept, nothing pending). They stay KEPT so a later change
 * cannot bring the doubling back unseen.
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

// Acceptance 1: pin, then a kill 0, 200 or 450 ms later; 2: a catch-up 3900 or 4500 ms
// late, no action; 3: 4500 ms late then an appended X; 4: 4500 or 6000 ms late then a pin.
const KEPT = [
  'pin-kill-0',
  'pin-kill-200',
  'pin-kill-450',
  'late-3900-none',
  'late-4500-none',
  'late-4500-edit',
  'late-4500-pin',
  'late-6000-pin',
];
const PINNED = ['pin-kill-0', 'pin-kill-200', 'pin-kill-450', 'late-4500-pin', 'late-6000-pin'];
const ac = (id: string): number => (id.startsWith('pin-kill') ? 1 : id.endsWith('none') ? 2 : id.endsWith('edit') ? 3 : 4);

describe('restart battery: rows stay KEPT', () => {
  for (const id of KEPT) {
    it(`${ac(id)}: ${id} is KEPT with the note once on both sides and pending 0`, async () => {
      const o = await runScenario(id);
      expect({ id, verdict: o.verdict, server: o.server, store: o.store, pending: o.pending }).toMatchObject({ id, verdict: 'KEPT' });
      expect(o.pending).toBe(0);
      if (PINNED.includes(id)) {
        expect(o.server?.systemTags).toContain('pinned');
        expect(o.store?.systemTags).toContain('pinned');
      }
    }, 45000);
  }
});
