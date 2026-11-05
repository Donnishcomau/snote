/**
 * #656: test/helpers/wait-held.ts has no time deadline, so the end of the test is what ends a wait that never holds.
 * Test 0 is a probe that is expected to fail: it leaves a wait that never holds and an unfinished fixture behind when
 * it ends. Tests 1 and 2 read what that left: the wait stopped and named its state, the fixture was stopped once.
 */
import { describe, expect, it } from 'vitest';
import { stopIfUnfinished, waitHeld } from '../helpers/wait-held';

let probe: Promise<void> | undefined;
let checks = 0;
let checksAtEnd = -1;
let stops = 0;
let stopsDone = 0;

describe('#656 a wait without a deadline ends with its test and names the state', () => {
  it.fails('0: probe (expected to fail): a wait that never holds and a fixture that never returned are left when the test ends', ({ onTestFinished }) => {
    probe = waitHeld(() => { checks++; return false; }, 'probe state');
    probe.catch(() => {});
    stopIfUnfinished(() => { stops++; });
    stopIfUnfinished(() => { stopsDone++; }).done();
    onTestFinished(() => { checksAtEnd = checks; });
  });

  it('1: WHEN a wait that never held outlives its test THEN its promise rejects with `never held: probe state`, and it checked its state at most once more after the test ended (test 0 itself fails on the same error)', async () => {
    await expect(probe).rejects.toThrow('never held: probe state');
    expect(checks - checksAtEnd).toBeLessThanOrEqual(1);
  });

  it('2: WHEN a test ends THEN a fixture that never returned is stopped exactly once and a fixture that returned (done) is not stopped', () => {
    expect(stops).toBe(1);
    expect(stopsDone).toBe(0);
  });

  it('3: WHEN the state holds THEN the wait resolves and this test passes', async () => {
    let n = 0;
    await waitHeld(() => ++n >= 3, 'third check');
    expect(n).toBe(3);
  });
});
