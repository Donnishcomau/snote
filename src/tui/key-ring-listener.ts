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
 * T411 — the ring's paste listener. useAppEffects calls it, and its effect
 * runs ahead of App's own useInput, so this 'input' listener is attached
 * before Ink's (Ink emits each parsed event to listeners in registration
 * order) and sees the raw chunk first. For a chunk App will replay one
 * character at a time it marks each replayed keystroke as text in the ring;
 * the run is cleared on a microtask — the end of that dispatch — so the
 * debt never leaks to keys typed after the paste.
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
        // gone again before any later key can claim it.
        beginTextRun(chars.length);
      }
    };
    emitter.on('input', handleInput);
    return () => {
      emitter.removeListener('input', handleInput);
    };
  }, [emitter]);
}
