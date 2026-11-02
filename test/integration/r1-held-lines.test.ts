/**
 * R1 sync-7 ( #105, re-index). At the start-up hand-off the
 * parts of the offline edit the server copy already holds are read by line
 * position: an offline edit that only moves a line is sent, a line another
 * device moved to where the offline copy inserted the same line ends once, and
 * after a re-index an offline deletion of a line another device moved loses no
 * other line.
 */
import { afterEach } from 'vitest';

import { heldBase } from '../../src/core/held-lines';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

describe('R1 sync-7: held parts of an offline edit are read by line position', () => {
  it('1: WHEN n1 (`line1\\nline2`) was edited offline only by moving line2 above line1, nothing else changed, and snote restarts THEN the server and the store hold content `line2\\nline1`, verdict `KEPT`', async () => {
    const o = await runScenario('offline-move');
    expect(o.server?.content).toBe('line2\nline1');
    expect(o.store?.content).toBe('line2\nline1');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 (`line1\\nline2`) was edited offline only by moving line2 above line1, nothing else changed, and snote restarts with a re-index THEN the server and the store hold content `line2\\nline1`, verdict `KEPT`', async () => {
    const o = await runScenario('offline-move-reindex');
    expect(o.server?.content).toBe('line2\nline1');
    expect(o.store?.content).toBe('line2\nline1');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN n1 (`a\\nb\\nX\\nc`) was edited offline to `a\\nX\\nb\\nX\\nc\\nOFF`, another device moved X above b and snote restarts with a re-index THEN the server and the store hold content `a\\nX\\nb\\nc\\nOFF`, verdict `KEPT`', async () => {
    const o = await runScenario('coincident-line-reindex');
    expect(o.server?.content).toBe('a\nX\nb\nc\nOFF');
    expect(o.store?.content).toBe('a\nX\nb\nc\nOFF');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN n1 (`a\\nb\\nc`) was edited offline to `a\\nc\\nOFF`, another device moved b to the top and snote restarts with a re-index THEN the server and the store hold content `b\\na\\nc\\nOFF`, verdict `KEPT`', async () => {
    const o = await runScenario('delete-moved-reindex');
    expect(o.server?.content).toBe('b\na\nc\nOFF');
    expect(o.store?.content).toBe('b\na\nc\nOFF');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('5: WHEN heldBase (base `line1\\nline2`) is asked for the edit `line2\\nline1` against `line1\\nline2`, `line1\\nline2\\nMK\\nY` against `line1\\nline2\\nMK`, `A\\nline2` against `A\\nB`, `A\\nline2` against `B\\nline2`, `line1\\nline2\\n\\nOFF` against `line1\\n\\nline2`, and (base `a\\n\\nb`) `a\\nb\\nb` against `Z\\na\\nb` and (base `a\\n\\nb`) `a\\n\\n\\nb` against `a\\nZ\\n\\nb` THEN it returns `line1\\nline2`, `line1\\nline2\\nMK`, `A\\nline2`, `line1\\nline2`, `line1\\nline2`, `a\\nb` and `a\\n\\nb`', () => {
    expect([
      heldBase('line1\nline2', 'line2\nline1', 'line1\nline2'),
      heldBase('line1\nline2', 'line1\nline2\nMK\nY', 'line1\nline2\nMK'),
      heldBase('line1\nline2', 'A\nline2', 'A\nB'),
      heldBase('line1\nline2', 'A\nline2', 'B\nline2'),
      heldBase('line1\nline2', 'line1\nline2\n\nOFF', 'line1\n\nline2'),
      heldBase('a\nb', 'a\nb\nb', 'Z\na\nb'),
      heldBase('a\n\nb', 'a\n\n\nb', 'a\nZ\n\nb'),
    ]).toEqual(['line1\nline2', 'line1\nline2\nMK', 'A\nline2', 'line1\nline2', 'line1\nline2', 'a\nb', 'a\n\nb']);
  });

  it('6: WHEN n1 (`a\\nb\\n\\nc`) was edited offline to `a\\n\\nb\\n\\nc\\nOFF`, another device moved the blank line above b and snote restarts with a re-index THEN the server and the store hold content `a\\n\\nb\\nc\\nOFF`, verdict `KEPT`', async () => {
    const o = await runScenario('coincident-blank-reindex');
    expect(o.server?.content).toBe('a\n\nb\nc\nOFF');
    expect(o.store?.content).toBe('a\n\nb\nc\nOFF');
    expect(o.verdict).toBe('KEPT');
  }, 45000);
});
