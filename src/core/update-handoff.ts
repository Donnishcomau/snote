// #30 L5a1: the update hand-off, loaded with import() only after a confirmed y and the quit save. For the plugin install
// it starts the bar's own update command (the L4a-verified bar-update, then snote again) in a floating terminal, with a
// fixed argument list built only from install paths: no remote text and no shell in this process. A failed save, a
// missing or linked bar-update, or a terminal that fails to start leaves the installed build as it is.
// #30 L5c: a direct install goes to src/core/direct-download.ts (download, then the update helper's stdin), after the same save check.
// proof: test/structure/update-handoff-argv.test.ts, test/core/update-handoff.test.ts
import { spawn as nodeSpawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { InstallKind } from './install-kind';
import { pluginCloneDir } from './update-state';

const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`; // one single-quoted shell word (BarWidget.qml q())

/**
 * The launcher argv. The inner command waits (at most waitSeconds) until this snote's shim lock is free and releases it
 * before bar-update runs, since setup takes that lock itself; it waits only on a regular file that is not a link, else
 * setup decides. On a time-out it prints one fixed line, fails, and runs nothing else.
 */
export function pluginHandOffArgv(home: string, env: NodeJS.ProcessEnv, waitSeconds = 10): string[] {
  const l = q(path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'omarchy-snote-plugin', 'run.lock'));
  const bar = q(path.join(pluginCloneDir(home), 'packaging', 'omarchy', 'bar-update'));
  return ['omarchy-launch-floating-terminal-with-presentation', `if [ ! -f ${l} ] || [ -L ${l} ] || /usr/bin/flock -x -w ${waitSeconds} ${l} true; then ${bar} && omarchy-launch-or-focus-tui snote; else echo 'another snote is still running: quit it and press U again'; false; fi`];
}

/** Starts the hand-off; `line` is the one fixed line main() prints when it refused (code 1), empty when started. */
export async function startHandOff(o: { kind: InstallKind; saved: boolean; home?: string; env?: NodeJS.ProcessEnv; run?: typeof nodeSpawn; log?: (line: string) => void }): Promise<{ code: number; line: string }> {
  const no = (why: string) => ({ code: 1, line: `snote did not update: ${why}` });
  if (!o.saved) return no('your notes could not be saved');
  const home = o.home ?? os.homedir();
  const env = { ...(o.env ?? process.env) };
  delete env.NODE_OPTIONS;
  if (o.kind === 'direct') return (await import('./direct-download')).startDirectHandOff({ home, env, log: o.log, run: o.run ?? nodeSpawn });
  try {
    if (o.kind !== 'plugin' || !fs.lstatSync(path.join(pluginCloneDir(home), 'packaging', 'omarchy', 'bar-update')).isFile()) return no('the update script was not found');
  } catch {
    return no('the update script was not found');
  }
  const [cmd, ...args] = pluginHandOffArgv(home, env);
  return new Promise((resolve) => {
    try {
      const child = (o.run ?? nodeSpawn)(cmd, args, { detached: true, stdio: 'ignore', env, timeout: 10_000 });
      child.once('error', () => resolve(no('the update terminal could not be started')));
      child.once('spawn', () => resolve((child.unref(), { code: 0, line: '' })));
    } catch {
      resolve(no('the update terminal could not be started'));
    }
  });
}
