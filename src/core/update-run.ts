/**
 * Update notice U3 wiring: the one entry point `main()` calls
 * once per run. The local check comes first: a newer version already
 * downloaded into the plugin clone needs no network at all, so it is
 * published and we stop. Otherwise the once-a-day remote check runs
 * and only a successful `available` answer is published; `current`,
 * `unknown` and `disabled` stay silent. Never throws.
 */

import { checkLocalUpdate, pluginCloneDir } from './update-state';
import { checkRemoteUpdate, type GitRunner } from './update-check';
import { publishUpdate } from './update-signal';

export async function runUpdateChecks(o: {
  version: string;
  home: string;
  env: NodeJS.ProcessEnv;
  stateDir: string;
  now?: number;
  run?: GitRunner;
  /** #443: true when this install is not the Omarchy plugin (the notice then names no plugin command). */
  offPlugin?: boolean;
}): Promise<void> {
  try {
    const cloneDir = pluginCloneDir(o.home);
    const local = checkLocalUpdate(o.version, cloneDir);
    if (local.state === 'restart') {
      // #443: restarting an install that is not the plugin does not run the clone's build, so it gets the off-plugin notice.
      publishUpdate(o.offPlugin ? { kind: 'available', offPlugin: true } : { kind: 'restart', available: local.available });
      return;
    }
    const remote = await checkRemoteUpdate({
      cloneDir,
      stateDir: o.stateDir,
      env: o.env,
      now: o.now ?? Date.now(),
      run: o.run,
    });
    if (remote.state === 'available') {
      publishUpdate(o.offPlugin ? { kind: 'available', offPlugin: true } : { kind: 'available' });
    }
  } catch {
    // the update notice never breaks the app
  }
}
