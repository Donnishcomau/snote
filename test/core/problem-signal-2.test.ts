import { beforeEach, describe, expect, it } from 'vitest';
import {
  publishProblem,
  currentProblem,
  onProblem,
  resetProblemSignal,
} from '../../src/core/problem-signal';

describe('problem signal robustness (T484)', () => {
  beforeEach(() => {
    resetProblemSignal();
  });

  it('1: WHEN two listeners are subscribed, the first throws, and publishProblem("x") is called THEN it does not throw and the second listener received x', () => {
    const received: string[] = [];
    onProblem(() => {
      throw new Error('boom');
    });
    onProblem((m) => received.push(m));
    expect(() => publishProblem('x')).not.toThrow();
    expect(received).toEqual(['x']);
  });

  it('2: WHEN publishProblem("sync failed:\\n  disk full") is called THEN the listener received "sync failed: disk full"', () => {
    const received: string[] = [];
    onProblem((m) => received.push(m));
    publishProblem('sync failed:\n  disk full');
    expect(received).toEqual(['sync failed: disk full']);
  });

  it('3: WHEN publishProblem("y") is called and currentProblem() is read twice THEN the first read is y and the second is null', () => {
    publishProblem('y');
    const first = currentProblem();
    const second = currentProblem();
    expect(first).toBe('y');
    expect(second).toBeNull();
  });
});
