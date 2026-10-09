/**
 * T473 — one shared helper that waits for an Ink frame or for Ink's key
 * handler to exist, so no test needs a fixed sleep.
 *
 * `waitForFrame` polls `lastFrame()` until the frame matches a condition.
 * `waitForInput` waits until Ink has attached its stdin `readable`
 * listener, which is the moment a written key reaches `useInput`
 * (Ink 7.1.1 drops keys written before that listener exists; see
 * node_modules/ink/build/components/App.js).
 *
 * Both are built on `vi.waitFor`, which retries its callback until it
 * stops throwing; no `setTimeout` call appears in this module.
 */
import { vi } from 'vitest';

type StdinLike = {
  listenerCount(event: string): number;
};

/**
 * Poll `lastFrame()` until `check` is satisfied and resolve with that
 * frame. `check` is either a substring the frame must contain or a
 * predicate over the frame. On timeout the returned promise rejects with
 * an error naming what was waited for and the last frame seen.
 */
export async function waitForFrame(
  lastFrame: () => string | undefined,
  check: string | ((frame: string) => boolean),
  timeoutMs = 2000,
): Promise<string> {
  const wanted =
    typeof check === 'string' ? `frame containing '${check}'` : 'frame matching predicate';
  let lastSeen = '';
  await vi.waitFor(
    () => {
      lastSeen = lastFrame() ?? '';
      const matched = typeof check === 'string' ? lastSeen.includes(check) : check(lastSeen);
      if (!matched) {
        throw new Error(`waitForFrame: no ${wanted} yet; last frame: ${JSON.stringify(lastSeen)}`);
      }
    },
    { timeout: timeoutMs, interval: 10 },
  );
  return lastSeen;
}

/**
 * Poll until Ink's stdin `readable` listener exists (the moment its key
 * handler is attached), then resolve.
 */
export async function waitForInput(stdin: StdinLike, timeoutMs = 2000): Promise<void> {
  await vi.waitFor(
    () => {
      if (stdin.listenerCount('readable') === 0) {
        throw new Error('waitForInput: no stdin readable listener yet');
      }
    },
    { timeout: timeoutMs, interval: 10 },
  );
}
