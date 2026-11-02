import { useStdin } from 'ink';
import React from 'react';

import { beginTextRun, pastedCharsOf } from './key-ring';

type Emitter = {
  on(event: 'input', listener: (input: string) => void): unknown;
  removeListener(event: 'input', listener: (input: string) => void): unknown;
};

type StdinCtxWithEmitter = ReturnType<typeof useStdin> & {
  internal_eventEmitter: Emitter;
};

/**
 * the ring's paste listener. useAppEffects calls it, and its effect
 * runs ahead of App's own useInput, so this 'input' listener is attached
 * before Ink's (Ink emits each parsed event to listeners in registration
 * order) and sees the raw chunk first. For a chunk App will replay one
 * character at a time it marks each replayed keystroke as text in the ring.
 * No timer or microtask clears the run: it drains one unit per recorded
 * keystroke inside App's synchronous replay (key-ring.ts `claimTextRun`),
 * and only `resetKeyLog` zeroes it. If a replay records fewer keys than the
 * chunk had characters, the rest masks the next typed keys as `<text>`:
 * over-masking in the crash ring, which hides keys and leaks none.
 */
export function useKeyRingTextListener(): void {
  const emitter = (useStdin() as StdinCtxWithEmitter).internal_eventEmitter;
  React.useEffect(() => {
    const handleInput = (chunk: string): void => {
      // pastedCharsOf applies App's own replay test (splitPastedInput):
      // only a multi-character chunk without an escape sequence qualifies.
      const chars = pastedCharsOf(chunk);
      if (chars !== null) {
        // The debt drains one keystroke per replayed character inside
        // App's synchronous replay (useInput's discreteUpdates), so it is
        // normally gone again before any later key can claim it.
        beginTextRun(chars.length);
      }
    };
    emitter.on('input', handleInput);
    return () => {
      emitter.removeListener('input', handleInput);
    };
  }, [emitter]);
}
