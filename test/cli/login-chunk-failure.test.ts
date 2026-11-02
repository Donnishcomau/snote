/**
 * diet2 (#30): when the login chunk (src/core/auth.ts, loaded with `import()`) cannot be loaded,
 * a login call fails like a network error: a rejected promise, which the login screen shows.
 * The mock factory throws, so the `import()` rejects; vitest wraps the factory message.
 */
import { describe, expect, it, vi } from 'vitest';

import { loginCalls } from '../../src/cli/login-calls';

vi.mock('../../src/core/auth', () => {
  throw new Error('chunk load failed: auth');
});

describe('diet2: a login chunk that cannot load is a failed call, not a crash', () => {
  it("1: WHEN the auth chunk cannot be loaded and `requestCode` is called THEN the call returns a promise that rejects with an `Error` (vitest wraps the factory message), and nothing throws before it", async () => {
    const calls = loginCalls(undefined, 'test-app');
    let result: Promise<unknown> | undefined;
    expect(() => { result = calls.requestCode('a@b.co'); }).not.toThrow();
    await expect(result).rejects.toBeInstanceOf(Error);
  });
});
