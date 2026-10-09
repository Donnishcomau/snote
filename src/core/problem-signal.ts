/**
 * The one problem signal (T441): a single module-level slot holding the
 * last failure message published by core code, so a write failure that
 * cannot reach the screen by itself still shows up on the notice line.
 * Same shape as the update signal: one stored value, many subscribers,
 * nothing async and no timers. Unlike the update signal, publishing the
 * same message again notifies every listener again.
 */

let current: string | null = null;
const listeners = new Set<(message: string) => void>();

/**
 * Publish a problem message. Every listener is notified on every
 * publish, even when the message repeats the current one. A listener
 * that throws is ignored so the rest still run, and every run of
 * whitespace in the message (newlines included) is folded to one space
 * so the notice line stays on a single row.
 */
export function publishProblem(message: string): void {
  const line = message.replace(/\s+/g, ' ');
  current = line;
  for (const listener of listeners) {
    try {
      listener(line);
    } catch {
      // one bad listener must not stop the rest
    }
  }
}

/**
 * The current message, or `null` when nothing has been published.
 * Returns the message once, then null: a reader that takes it clears it.
 */
export function currentProblem(): string | null {
  const taken = current;
  current = null;
  return taken;
}

/** Subscribe to problems; returns the unsubscribe function. */
export function onProblem(listener: (message: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: clear the stored value and every listener. */
export function resetProblemSignal(): void {
  current = null;
  listeners.clear();
}

/**
 * The message for a caught failure: `code` when the error carries a
 * string one (an `EISDIR` from `fs`), the `message` of an Error, and the
 * `String` of anything else.
 */
export function problemText(label: string, err: unknown): string {
  if (typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string') {
    return `${label}: ${(err as { code: string }).code}`;
  }
  if (err instanceof Error) {
    return `${label}: ${err.message}`;
  }
  return `${label}: ${String(err)}`;
}
