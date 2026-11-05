/**
 * #656: wait until a state holds, with no time deadline of its own: only the per-test timeout ends a wait that
 * never holds. When the test ends first, the loop stops (nothing keeps polling a stopped server or store) and the
 * test's failure names the state: `never held: <label>`. No fixed sleep: `everyMs` is the re-check interval.
 */
import { onTestFinished } from 'vitest';

export async function waitHeld(cond: () => boolean, label: string, everyMs = 20): Promise<void> {
  let ended = false;
  let held = false;
  onTestFinished(() => {
    ended = true;
    if (!held) throw new Error(`never held: ${label}`);
  });
  while (!cond()) {
    if (ended) throw new Error(`never held: ${label}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
  held = true;
}

/** #656: run `stop` when the test ends unless `done()` was called first (a fixture that never returned). */
export function stopIfUnfinished(stop: () => void | Promise<void>): { done: () => void } {
  let finished = false;
  onTestFinished(async () => {
    if (!finished) await stop();
  });
  return { done: () => { finished = true; } };
}
