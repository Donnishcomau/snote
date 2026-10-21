/**
 * Update banner watch (#66): while snote stays open it asks the plugin
 * clone's origin for the newest release tag when it starts (if the last
 * answer is over 24 hours old) and then every 24 hours, with no restart, and publishes the banner when that
 * version is newer than the running one. F234: the answer is cached for
 * 24 hours across restarts (update-tag-check.json, written on success only),
 * so a start inside that window asks no one and shows a cached newer version;
 * an offline or failed check shows nothing and writes nothing. The
 * opt-out is SNOTE_UPDATE_CHECK=off (or 0), as for the start-up check.
 * Never throws.
 */

import { checkRemoteVersion, updateCheckEnabled } from './update-check';
import type { GitRunner } from './update-check';
import { compareVersions, pluginCloneDir } from './update-state';
import { publishBanner } from './update-banner';

export const WATCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Repeat `fn` every `ms`; returns the cancel function. Injectable so no test waits 24 hours. */
export type Schedule = (fn: () => void, ms: number) => () => void;

const realSchedule: Schedule = (fn, ms) => {
  const timer = setInterval(fn, ms);
  timer.unref();
  return () => clearInterval(timer);
};

let stopActive: (() => void) | null = null;

/**
 * Start the watch: one check now, then one every 24 hours. Starting it
 * again cancels the earlier one first, so a re-login never leaves two
 * timers. Returns the stop function.
 */
export function startUpdateWatch(o: {
  version: string;
  home: string;
  env: NodeJS.ProcessEnv;
  run?: GitRunner;
  schedule?: Schedule;
  /** Where the tag-check cache lives; without it every check asks the origin. */
  stateDir?: string;
  now?: () => number;
}): () => void {
  stopActive?.();
  stopActive = null;
  if (!updateCheckEnabled(o.env)) {
    return () => {};
  }
  const cloneDir = pluginCloneDir(o.home);
  const check = async (): Promise<void> => {
    try {
      const newest = await checkRemoteVersion({
        cloneDir,
        env: o.env,
        run: o.run,
        stateDir: o.stateDir,
        now: o.now,
      });
      if (newest !== null && compareVersions(newest.version, o.version) > 0) {
        publishBanner(o.version, newest.version);
      }
    } catch {
      // the banner never breaks the app
    }
  };
  void check();
  const cancel = (o.schedule ?? realSchedule)(() => {
    void check();
  }, WATCH_INTERVAL_MS);
  const stop = (): void => {
    cancel();
    if (stopActive === stop) {
      stopActive = null;
    }
  };
  stopActive = stop;
  return stop;
}
