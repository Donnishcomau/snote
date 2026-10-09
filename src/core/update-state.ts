import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Update notice U1 (T385): decide whether a newer snote already sits
 * in the user's omarchy plugin clone, so the app can say "restart
 * snote / the bar to use the update". Pure: no network, no child
 * process, no UI, and no import of the running version (the caller
 * passes it in).
 */

const VERSION_RE = /^\d+(\.\d+)*$/;

/**
 * Compare two dotted-number versions. Numeric per part, so `0.2.10`
 * is greater than `0.2.9`; missing parts count as 0. Returns a
 * negative number when a < b, 0 when equal, positive when a > b.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().split('.');
  const pb = b.trim().split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? '0');
    const nb = Number(pb[i] ?? '0');
    if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

/**
 * Where the omarchy plugin clone lives for the given home directory.
 * `omarchy-plugin-update` sets PLUGINS_DIR="$HOME/.config/omarchy/plugins"
 * (no XDG variable), and the clone is named by the plugin id.
 */
export function pluginCloneDir(home: string): string {
  return path.join(
    home,
    '.config',
    'omarchy',
    'plugins',
    'io.github.donnishcomau.snote-simplenote'
  );
}

type LocalUpdate =
  | { state: 'current' }
  | { state: 'restart'; installed: string; available: string };

/**
 * Check whether the plugin clone at `cloneDir` holds a version newer
 * than the running one. Reads `<cloneDir>/plugin-dist/VERSION` with
 * the default `fs.readFileSync` reader (or the one passed in), trims
 * the text, and reports `restart` only when it is a dotted-number
 * version greater than `running`. A missing, unreadable or
 * non-version file is `{ state: 'current' }`; this never throws.
 */
export function checkLocalUpdate(
  running: string,
  cloneDir: string,
  read: (file: string) => string = (file) => fs.readFileSync(file, 'utf8')
): LocalUpdate {
  let raw: string;
  try {
    raw = read(path.join(cloneDir, 'plugin-dist', 'VERSION'));
  } catch {
    return { state: 'current' };
  }
  const available = raw.trim();
  if (!VERSION_RE.test(available)) {
    return { state: 'current' };
  }
  if (compareVersions(available, running) > 0) {
    return { state: 'restart', installed: running, available };
  }
  return { state: 'current' };
}
