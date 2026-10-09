/**
 * The one update signal (T387): a single module-level slot holding the
 * current update notice, shared between the update checks, the status
 * file and the on-screen notice. Same shape as the `useNotice` state
 * seen from outside: one stored value, many subscribers, nothing
 * async and no timers.
 */

export type UpdateSignal = { kind: 'available' } | { kind: 'restart'; available: string };

let current: UpdateSignal | null = null;
const listeners = new Set<(u: UpdateSignal) => void>();

/**
 * Publish a signal. A signal with the same `kind` as the current one
 * is ignored (the value is kept and nobody is notified); a different
 * `kind` replaces the value and calls every listener once.
 */
export function publishUpdate(u: UpdateSignal): void {
  if (current !== null && current.kind === u.kind) {
    return;
  }
  current = u;
  for (const listener of listeners) {
    listener(u);
  }
}

/** The current signal, or `null` when nothing has been published. */
export function currentUpdate(): UpdateSignal | null {
  return current;
}

/** Subscribe to changes; returns the unsubscribe function. */
export function onUpdate(listener: (u: UpdateSignal) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: clear the stored value and every listener. */
export function resetUpdateSignal(): void {
  current = null;
  listeners.clear();
}
