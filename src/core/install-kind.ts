import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { defaultGitRunner, type GitRunner } from './update-check';

/**
 * #69 (0.2.8 slice): how this snote was installed, derived from the
 * resolved real path of the running entry file, compared with the plugin
 * folder under `$XDG_DATA_HOME` (or `~/.local/share`): no other snote-read
 * env variable and no file a remote can write decides it. plugin = the Omarchy
 * plugin build `<data home>/omarchy-snote-plugin/app/`; package = under
 * `/usr/`; dev = a git checkout; unknown = anything else, a path with a
 * control byte or `..`, or a path that cannot be resolved.
 *
 * Only the plugin kind may ever be offered an update action (#30 reads
 * `canOfferUpdate`); a package install has no version source in 0.2.8, so
 * it runs no update check and shows no banner; dev and unknown get the
 * notice only.
 * proof: test/core/install-kind.test.ts
 */
export type InstallKind = 'plugin' | 'package' | 'dev' | 'unknown';

/** The manifest homepage (manifest.json `homepage`); a test keeps the two equal. */
export const HOMEPAGE = 'https://github.com/donnishcomau/snote';

const CONTROL_BYTE = /[\u0000-\u001f\u007f-\u009f]/;

function under(file: string, dir: string): boolean {
  return file.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
}

export function installKind(o: {
  entry: string | undefined;
  /** `$XDG_DATA_HOME` or `~/.local/share`, as `packaging/omarchy/setup` resolves it. */
  dataHome: string;
  realpath?: (p: string) => string;
  hasGit?: (dir: string) => boolean;
}): InstallKind {
  try {
    if (!o.entry) return 'unknown';
    const real = (o.realpath ?? fs.realpathSync)(o.entry);
    if (!path.isAbsolute(real) || CONTROL_BYTE.test(real) || real.split('/').includes('..')) {
      return 'unknown';
    }
    const appDir = path.join((o.realpath ?? fs.realpathSync)(o.dataHome), 'omarchy-snote-plugin', 'app');
    if (under(real, appDir)) return 'plugin';
    if (under(real, '/usr')) return 'package';
    const hasGit = o.hasGit ?? ((d: string) => fs.existsSync(path.join(d, '.git')));
    let dir = path.dirname(real);
    for (let i = 0; i < 8 && dir !== path.dirname(dir); i++, dir = path.dirname(dir)) {
      if (hasGit(dir)) return 'dev';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The kind of the running snote (entry file `process.argv[1]`). */
export function runningInstallKind(): InstallKind {
  return installKind({
    entry: process.argv[1],
    dataHome: process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
  });
}

/** Only a plugin install may be offered an update action (#30 reads this). */
export function canOfferUpdate(kind: InstallKind): boolean {
  return kind === 'plugin';
}

/** Does this kind run the update check and show the banner? Not a package install (no version source). */
export function updateChecksFor(kind: InstallKind): boolean {
  return kind !== 'package';
}

/** MUST 1 form: lower-case, trailing `/` and `.git` stripped. */
function normaliseUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

/** The five `-c` values f234/f234b put before `ls-remote` (src/core/update-check.ts BASE_GIT_FLAGS and REMOTE_GIT_FLAGS), as a set. */
const ALLOWED_C_VALUES = new Set([
  'credential.helper=',
  'core.hooksPath=/dev/null',
  'core.fsmonitor=false',
  'protocol.allow=never',
  'protocol.https.allow=always',
]);
const URL_SHAPE = /^[A-Za-z0-9:/._-]+$/;

/**
 * A git runner with an allow-list for `ls-remote`. Any call that holds the
 * argument `ls-remote` is passed on only in one of two exact shapes:
 *   [-c <allowed value>]* ls-remote --tags <url>
 *   [-c <allowed value>]* ls-remote <url> HEAD
 * where every `-c` value is one of the five above (any order, repeats
 * allowed) and `<url>` matches /^[A-Za-z0-9:/._-]+$/ and equals the
 * manifest homepage after normalising. Everything else (`-o`, `--namespace`,
 * `--upload-pack`, `-C`, a `url.*.insteadOf` value, extra arguments, a
 * local path) answers `{ code: null, stdout: '' }` and never calls `inner`.
 * Calls without the argument `ls-remote` pass through unchanged.
 */
export function homepageGuard(inner: GitRunner = defaultGitRunner): GitRunner {
  return async (args, opts) => {
    if (args.includes('ls-remote') && !isAllowedLsRemote(args)) {
      return { code: null, stdout: '' };
    }
    return inner(args, opts);
  };
}

function isAllowedLsRemote(args: string[]): boolean {
  let i = 0;
  while (args[i] === '-c') {
    if (!ALLOWED_C_VALUES.has(args[i + 1] ?? '')) return false;
    i += 2;
  }
  if (args[i] !== 'ls-remote') return false;
  const rest = args.slice(i + 1);
  let url: string | undefined;
  if (rest.length === 2 && rest[0] === '--tags') url = rest[1];
  else if (rest.length === 2 && rest[1] === 'HEAD') url = rest[0];
  return url !== undefined && URL_SHAPE.test(url) && normaliseUrl(url) === normaliseUrl(HOMEPAGE);
}
