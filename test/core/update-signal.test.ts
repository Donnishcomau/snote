import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentUpdate,
  onUpdate,
  publishUpdate,
  resetUpdateSignal,
  type UpdateSignal,
} from '../../src/core/update-signal.js';

describe('update-signal (T387)', () => {
  afterEach(() => {
    resetUpdateSignal();
  });

  it('1: WHEN currentUpdate() is called before any publish THEN it returns null', () => {
    expect(currentUpdate()).toBe(null);
  });

  it('2: WHEN a listener is subscribed and publishUpdate({ kind: "available" }) runs THEN the listener was called 1 time with { kind: "available" } and currentUpdate() equals it', () => {
    const listener = vi.fn<(u: UpdateSignal) => void>();
    onUpdate(listener);
    publishUpdate({ kind: 'available' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ kind: 'available' });
    expect(currentUpdate()).toEqual({ kind: 'available' });
  });

  it('3: WHEN publishUpdate({ kind: "available" }) runs a second time THEN the listener is still at 1 call', () => {
    const listener = vi.fn<(u: UpdateSignal) => void>();
    onUpdate(listener);
    publishUpdate({ kind: 'available' });
    publishUpdate({ kind: 'available' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('4: WHEN publishUpdate({ kind: "restart", available: "0.2.3" }) runs THEN the listener has 2 calls and currentUpdate() equals { kind: "restart", available: "0.2.3" }', () => {
    const listener = vi.fn<(u: UpdateSignal) => void>();
    onUpdate(listener);
    publishUpdate({ kind: 'available' });
    publishUpdate({ kind: 'restart', available: '0.2.3' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(currentUpdate()).toEqual({ kind: 'restart', available: '0.2.3' });
  });

  it('5: WHEN the listener is unsubscribed and publishUpdate({ kind: "available" }) runs THEN the listener is still at 2 calls and currentUpdate() equals { kind: "available" }', () => {
    const listener = vi.fn<(u: UpdateSignal) => void>();
    const unsubscribe = onUpdate(listener);
    publishUpdate({ kind: 'available' });
    publishUpdate({ kind: 'restart', available: '0.2.3' });
    unsubscribe();
    publishUpdate({ kind: 'available' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(currentUpdate()).toEqual({ kind: 'available' });
  });

  it('6: WHEN resetUpdateSignal() runs THEN currentUpdate() is null and a later publish calls no earlier listener', () => {
    const listener = vi.fn<(u: UpdateSignal) => void>();
    onUpdate(listener);
    publishUpdate({ kind: 'available' });
    resetUpdateSignal();
    expect(currentUpdate()).toBe(null);
    publishUpdate({ kind: 'restart', available: '0.2.3' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
