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
 * #442: homebrew = a Homebrew keg `<prefix>/Cellar/snote/<version>/` under any prefix
 * (/opt/homebrew, /usr/local, /home/linuxbrew/.linuxbrew or a custom one);
 * `brew upgrade snote` is its one updater, so it runs no update check.
 *
 * direct (#556 L3) = the direct installer's build `~/.local/share/snote-app/app/`
 * (packaging/direct/install writes it under $HOME, not under $XDG_DATA_HOME).
 *
 * Only the plugin and direct kinds may be offered an update action (#30 reads
 * `canOfferUpdate`; L5c adds direct); a package install has no version source in 0.2.8, so
 * it runs no update check and shows no banner; dev and unknown get the
 * notice only.
 * proof: test/core/install-kind.test.ts
 */
export type InstallKind = 'plugin' | 'homebrew' | 'direct' | 'package' | 'dev' | 'unknown';

/** The manifest homepage (manifest.json `homepage`); a test keeps the two equal. */
export const HOMEPAGE = 'https://github.com/donnishcomau/snote';

const CONTROL_BYTE = /[\u0000-\u001f\u007f-\u009f]/;

function under(file: string, dir: string): boolean {
  return file.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
}

/** #442: a file inside a Homebrew keg of snote, `<any prefix>/Cellar/snote/<version>/`. */
const HOMEBREW_KEG = /\/Cellar\/snote\/[^/]+\//;

/**
 * The path rules, first match wins (#442: growth by data, a kind is a row).
 * homebrew sits before package, so `/usr/local/Cellar/snote/...` is a keg.
 */
const PATH_KINDS: ReadonlyArray<{ kind: InstallKind; holds: (real: string, appDir: string, directDir: string) => boolean }> = [
  { kind: 'direct', holds: (real, _appDir, directDir) => under(real, directDir) },
  { kind: 'plugin', holds: (real, appDir) => under(real, appDir) },
  { kind: 'homebrew', holds: (real) => HOMEBREW_KEG.test(real) },
  { kind: 'package', holds: (real) => under(real, '/usr') },
];

/** Kinds that run no update check and show no banner: a package (no version source) and homebrew (`brew upgrade`). */
const NO_UPDATE_CHECK: ReadonlyArray<InstallKind> = ['package', 'homebrew'];

export function installKind(o: {
  entry: string | undefined;
  /** `$XDG_DATA_HOME` or `~/.local/share`, as `packaging/omarchy/setup` resolves it. */
  dataHome: string;
  /** The home folder; the direct build is `<home>/.local/share/snote-app/app` (a parameter, not an env variable). */
  home?: string;
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
    const directDir = o.home === undefined ? '\0' : directAppDir(o.home, o.realpath ?? fs.realpathSync);
    for (const rule of PATH_KINDS) if (rule.holds(real, appDir, directDir)) return rule.kind;
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

/** `<real share folder>/snote-app/app`, or a path no file is under when the share folder does not resolve. */
function directAppDir(home: string, realpath: (p: string) => string): string {
  try {
    return path.join(realpath(path.join(home, '.local', 'share')), 'snote-app', 'app');
  } catch {
    return '\0';
  }
}

/** The kind of the running snote (entry file `process.argv[1]`). */
export function runningInstallKind(): InstallKind {
  return installKind({
    entry: process.argv[1],
    dataHome: process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    home: os.homedir(),
  });
}

/**
 * #443: where the update check keeps its once-a-day cache. A plugin install
 * keeps the bar plugin's folder; any other install uses snote's own data
 * folder, so nothing creates `omarchy-snote-plugin` off the plugin install.
 */
export function updateStateDir(kind: InstallKind, pluginDir: string, dataDir: string): string {
  return kind === 'plugin' ? pluginDir : dataDir;
}

/** Only a plugin or a direct install may be offered an update action (#30 reads this; direct since L5c). */
export function canOfferUpdate(kind: InstallKind): boolean {
  return kind === 'plugin' || kind === 'direct';
}

/** Does this kind run the update check and show the banner? Not a package install (no version source), not homebrew (#442). */
export function updateChecksFor(kind: InstallKind): boolean {
  return !NO_UPDATE_CHECK.includes(kind);
}

/**
 * #442: the `install:` lines `snote --check` prints. A homebrew install says
 * its one updater; when the Omarchy plugin build is present too, the second
 * install is named. Fixed text only: no path, no remote text.
 */
export function installReport(kind: InstallKind, pluginAppPresent: boolean): string {
  const lines = [kind === 'homebrew' ? 'install: homebrew (updates come from brew upgrade snote)' : `install: ${kind}`];
  if (pluginAppPresent && kind !== 'plugin') lines.push('install: plugin too (update the Omarchy bar plugin with omarchy plugin update)');
  return lines.join('\n');
}

/** #442: the running snote's `install:` lines (kind of `process.argv[1]`, plugin build under the data home). */
export function runningInstallReport(): string {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return installReport(runningInstallKind(), fs.existsSync(path.join(dataHome, 'omarchy-snote-plugin', 'app')));
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
