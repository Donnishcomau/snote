/**
 * The one update banner signal (#66): the newer release the 24-hour
 * check found, held in memory only. The banner shows `running ->
 * available` until the user dismisses it; a dismissal hides that
 * `available` version only, so the banner returns for a newer one.
 * Same shape as the update signal: one stored value, many
 * subscribers, no timers and nothing written to disk.
 */

export interface BannerSignal {
  running: string;
  available: string;
}

let current: BannerSignal | null = null;
let dismissed: string | null = null;
let runningIsNewest = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // one bad listener must not stop the rest
    }
  }
}

/**
 * Publish the newer version found. The same pair published again is
 * ignored; a version the user already dismissed stays hidden.
 */
export function publishBanner(running: string, available: string): void {
  if (current !== null && current.running === running && current.available === available) {
    return;
  }
  current = { running, available };
  if (dismissed === available) {
    return;
  }
  notify();
}

/** The banner to show now, or `null` when none is published or it was dismissed. */
export function currentBanner(): BannerSignal | null {
  return current !== null && current.available !== dismissed ? current : null;
}

/**
 * The release check found no release newer than the running snote. The status
 * file uses it so a running newest release never announces an update.
 * Listeners are told when the answer changes.
 */
export function markRunningNewest(value: boolean): void {
  if (runningIsNewest === value) {
    return;
  }
  runningIsNewest = value;
  notify();
}

/** True once the release check found that the running snote is the newest release. */
export function runningIsNewestRelease(): boolean {
  return runningIsNewest;
}

/** Hide the banner for the version it names; a newer version shows it again. */
export function dismissBanner(): void {
  if (current === null) {
    return;
  }
  dismissed = current.available;
  notify();
}

/** Subscribe to changes; returns the unsubscribe function. */
export function onBanner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: clear the stored value, the dismissal and every listener. */
export function resetBanner(): void {
  current = null;
  dismissed = null;
  runningIsNewest = false;
  listeners.clear();
}
