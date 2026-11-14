/**
 * #615 item 4: the third-party notices that travel with the built plugin-dist.
 * The bundled MIT, ISC and BSD packages ask that their copyright and
 * permission notices go with every copy, and esbuild keeps only `/*! *\/` comments.
 * This builds THIRD-PARTY-NOTICES from the build's own esbuild metafile: every
 * package under node_modules that a bundled input comes from, with its name,
 * version, licence id and the text of each licence or NOTICE file it ships.
 * Fails closed: a bundled package with no licence file stops the build, unless
 * packaging/third-party/<name>@<version>/ holds at least one licence file for it.
 * proof: test/packaging/third-party-notices.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';

export const NOTICES_FILE = 'THIRD-PARTY-NOTICES';

export const NOTICES_HEADER = [
  'Third-party software in snote',
  '',
  'The snote build includes the open-source packages listed below. Each entry',
  "gives the package's name, version and licence, followed by the licence and",
  'notice text that goes with it. The text is copied word for word from the',
  'package or, where the package ships none, from its upstream repository.',
  'Where neither has one, the entry says so.',
].join('\n');

const PLAIN_VERSION = /^[0-9A-Za-z.+-]+$/;

const LICENCE_NAME = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** Licence texts for bundled packages that ship none, one folder per `<name>@<version>` (`/` in a scope name as `+`). */
export const EXTRA_DIR = 'packaging/third-party';

/** @param {string} dir @returns {string[]} the licence and notice files directly in dir, sorted */
function licenceFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENCE_NAME.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * The package folders (relative to root, `/` separators) that the metafile's inputs come from: the
 * innermost `node_modules/<name>` or `node_modules/@scope/<name>` of each input path, so a nested copy
 * is its own entry. Inputs outside node_modules (snote's own src and vendor/) are not third party.
 * @param {{inputs: Record<string, unknown>}} metafile esbuild metafile
 * @returns {string[]} sorted, unique package folders
 */
export function bundledPackageDirs(metafile) {
  const dirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const p = input.split(path.sep).join('/').replace(/^[a-z-]+:/, '');
    const i = p.lastIndexOf('node_modules/');
    if (i < 0) continue;
    const rest = p.slice(i + 'node_modules/'.length).split('/');
    const name = rest[0].startsWith('@') ? rest.slice(0, 2).join('/') : rest[0];
    dirs.add(p.slice(0, i) + 'node_modules/' + name);
  }
  return [...dirs].sort();
}

/**
 * The text of THIRD-PARTY-NOTICES for the packages the metafile names.
 * @param {{inputs: Record<string, unknown>}} metafile esbuild metafile (absWorkingDir = root)
 * @param {string} root the folder the metafile paths are relative to
 * @returns {string}
 */
export function thirdPartyNotices(metafile, root, extraDir = path.join(root, EXTRA_DIR)) {
  const missing = [];
  const bad = [];
  const entries = bundledPackageDirs(metafile).map((dir) => {
    const abs = path.join(root, dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf8'));
    // the name must be the folder's own node_modules name and the version a plain version, so neither can reach
    // outside EXTRA_DIR in the path below or take another package's entry (security line 3 L1)
    if (pkg.name !== dir.slice(dir.lastIndexOf('node_modules/') + 'node_modules/'.length) || typeof pkg.version !== 'string' || !PLAIN_VERSION.test(pkg.version)) {
      bad.push(dir);
      return null;
    }
    const key = `${pkg.name}@${pkg.version}`;
    // a package that ships no licence file takes its text from EXTRA_DIR/<name>@<version>/ (data, one folder per package)
    const extra = path.join(extraDir, key.replace('/', '+'));
    const from = licenceFiles(abs).length > 0 ? abs : fs.existsSync(extra) && licenceFiles(extra).length > 0 ? extra : null;
    if (from === null) {
      missing.push(`${key} (${dir})`);
      return null;
    }
    const licence = typeof pkg.license === 'string' ? pkg.license : 'see the licence text';
    const texts = licenceFiles(from).map((f) => `--- ${f}\n\n${fs.readFileSync(path.join(from, f), 'utf8').replace(/\r\n/g, '\n').trimEnd()}\n`);
    return { key, body: `${pkg.name} ${pkg.version} (${licence})\n\n${texts.join('\n')}` };
  });
  if (bad.length > 0) throw new Error(`third-party notices: bad package.json name or version in ${bad.join(', ')}`);
  if (missing.length > 0) throw new Error(`third-party notices: no licence file for ${missing.join(', ')}`);
  const unique = [...new Map(entries.filter((e) => e !== null).map((e) => [e.key, e])).values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const rule = '='.repeat(72);
  return [NOTICES_HEADER, ...unique.map((e) => `${rule}\n${e.body}`)].join('\n\n') + '\n';
}
