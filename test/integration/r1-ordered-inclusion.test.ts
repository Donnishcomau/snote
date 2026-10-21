/**
 * R1 sync-5b (F236). "Already held" at the start-up hand-off reads line order,
 * not only line counts: another device's move or added blank line made while
 * snote was closed with an offline edit is kept, also after a re-index.
 */
import { afterEach } from 'vitest';

import { editIncludedInOrder } from '../../src/core/line-inclusion';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

describe('R1 sync-5b: a change counts as held only with its lines in order', () => {
  it('1: WHEN n1 was edited offline to `line1\\nline2\\nOFF`, another device moved line2 above line1 and snote restarts with a re-index THEN the server and the store hold content `line2\\nline1\\nOFF`, verdict `KEPT`', async () => {
    const o = await runScenario('F236-move-reindex');
    expect(o.server?.content).toBe('line2\nline1\nOFF');
    expect(o.store?.content).toBe('line2\nline1\nOFF');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 was edited offline to `line1\\nline2\\n\\nOFF`, another device added a blank line between line1 and line2 and snote restarts with a re-index THEN the server and the store hold content `line1\\n\\nline2\\n\\nOFF`, verdict `KEPT`', async () => {
    const o = await runScenario('F236-blank-reindex');
    expect(o.server?.content).toBe('line1\n\nline2\n\nOFF');
    expect(o.store?.content).toBe('line1\n\nline2\n\nOFF');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN editIncludedInOrder is asked whether `line1\\nline2\\nOFF` holds the change from `line1\\nline2` to `line2\\nline1`, and whether `line1\\nline2\\n\\nOFF` holds the change to `line1\\n\\nline2` THEN both answers are `false`', () => {
    expect([
      editIncludedInOrder('line1\nline2', 'line2\nline1', 'line1\nline2\nOFF'),
      editIncludedInOrder('line1\nline2', 'line1\n\nline2', 'line1\nline2\n\nOFF'),
    ]).toEqual([false, false]);
  });

  it('4: WHEN editIncludedInOrder is asked whether `line1\\nline2\\nMK\\nY` holds the change from `line1\\nline2` to `line1\\nline2\\nMK`, and whether `line1\\nline2\\nOFF` holds the change to `line1` THEN the answers are `true` and `false`', () => {
    expect([
      editIncludedInOrder('line1\nline2', 'line1\nline2\nMK', 'line1\nline2\nMK\nY'),
      editIncludedInOrder('line1\nline2', 'line1', 'line1\nline2\nOFF'),
    ]).toEqual([true, false]);
  });
});
