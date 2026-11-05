/**
 * #689: closing the terminal window (SIGHUP) or SIGTERM must not lose
 * what the store holds. Ink's own signal-exit hook unmounts the screen (the
 * inline editor stores its text then) but re-raises the signal before the
 * debounced state.json save runs. This listener goes first (prepended): it
 * removes itself, closes the screen, writes state.json synchronously and raises
 * the same signal again; signal-exit's listener, next in the same emit, is then
 * the only one left and ends snote by that signal at once, before any code
 * after the closed screen (the quit path) can run.
 */
type Sig = 'SIGHUP' | 'SIGTERM';

export interface SignalProcess {
  pid: number;
  prependListener(sig: Sig, listener: () => void): unknown;
  off(sig: Sig, listener: () => void): unknown;
  kill(pid: number, sig: Sig): unknown;
}

/** Listen for SIGHUP and SIGTERM; the returned function stops listening. */
export function flushOnSignal(proc: SignalProcess, unmount: () => void, flush: () => void): () => void {
  const stop = (): void => {
    proc.off('SIGHUP', onHup);
    proc.off('SIGTERM', onTerm);
  };
  const listener = (sig: Sig) => (): void => {
    stop();
    try { unmount(); } catch { /* the screen is closing anyway */ }
    try { flush(); } catch { /* a failed write is reported by the save itself */ }
    proc.kill(proc.pid, sig);
  };
  const onHup = listener('SIGHUP');
  const onTerm = listener('SIGTERM');
  proc.prependListener('SIGHUP', onHup);
  proc.prependListener('SIGTERM', onTerm);
  return stop;
}
