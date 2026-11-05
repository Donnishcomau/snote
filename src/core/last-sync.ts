/**
 * #619: the last-sync text of the status bar. `at` is the latest moment the store was
 * connected with nothing pending (useAppState records it), this session only; `null` = not
 * synced since start, which shows nothing (the word says it). More than a day before `now`
 * adds the date. A constant-format string: digits, a fixed month name, `:`.
 * proof: test/core/status-text.test.ts
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_MS = 86_400_000;

const two = (n: number): string => String(n).padStart(2, '0');

export function syncedText(at: number | null, now: number): string | undefined {
  if (at === null) return undefined;
  const d = new Date(at);
  const time = two(d.getHours()) + ':' + two(d.getMinutes());
  return now - at > DAY_MS ? `synced ${d.getDate()} ${MONTHS[d.getMonth()]} ${time}` : `synced ${time}`;
}

/** #649: how often the synced text is redrawn with no store change. */
export const TICK_MS = 60_000;

/**
 * #649: the synced text over time. While `current()` holds (connected with nothing pending) the sync is current, so each
 * update and each minute tick stamp the time; once it stops holding the time stays and the tick turns it into the date
 * form after a day. `now` is a test seam; the product uses Date.now. proof: test/core/status-text.test.ts
 */
export function syncClock(current: () => boolean, show: (text: string | undefined) => void, now: () => number = Date.now): { update(): void; stop(): void } {
  let at: number | null = null;
  const update = (): void => {
    if (current()) at = now();
    show(syncedText(at, now()));
  };
  const tick = setInterval(update, TICK_MS);
  tick.unref();
  return { update, stop: () => clearInterval(tick) };
}
