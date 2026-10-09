/**
 * Update notice U3 wiring (T390): the one entry point `main()` calls
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
}): Promise<void> {
  try {
    const cloneDir = pluginCloneDir(o.home);
    const local = checkLocalUpdate(o.version, cloneDir);
    if (local.state === 'restart') {
      publishUpdate({ kind: 'restart', available: local.available });
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
      publishUpdate({ kind: 'available' });
    }
  } catch {
    // the update notice never breaks the app
  }
}
