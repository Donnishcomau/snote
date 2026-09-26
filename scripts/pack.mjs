#!/usr/bin/env node
/**
 * Packaging script: create a release tarball from the built bundle.
 *
 * @typedef {{ name: string, files: [from: string, to: string][] }} PackList
 * @typedef {{ version: string, bundle: string, stageDir: string, outDir: string }} MakeTarballOpts
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, chmodSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

/**
 * Return the list of files to include in the release tarball.
 * @param {string} version
 * @returns {PackList}
 */
export function packList(version) {
  const name = 'snote-' + version;
  const files = [
    ['dist/cli.js', 'bin/snote'],
    ['packaging/omarchy/snote.desktop', 'share/applications/snote.desktop'],
    ['LICENSE', 'share/licenses/snote/LICENSE'],
  ];
  return { name, files };
}

/**
 * Build a release tarball.
 * @param {MakeTarballOpts} opts
 * @returns {string}
 */
export function makeTarball(opts) {
  const { version, bundle, stageDir, outDir } = opts;
  const { name, files } = packList(version);

  if (!existsSync(bundle)) {
    throw new Error('run npm run build first');
  }

  const staged = join(stageDir, name);

  // The launcher imports ./snote-main.js relative to itself, so the real
  // bundle must sit next to it; require it before anything is staged.
  const main = join(dirname(bundle), 'snote-main.js');
  if (!existsSync(main) && readFileSync(bundle, 'utf8').includes('./snote-main.js')) {
    throw new Error('run npm run build first');
  }

  // Clean only the staged release folder (never stageDir itself)
  if (existsSync(staged)) {
    rmSync(staged, { recursive: true, force: true });
  }
  mkdirSync(staged, { recursive: true });

  for (const [from, to] of files) {
    const dest = join(staged, to);
    mkdirSync(join(dest, '..'), { recursive: true });
    const copyFrom = from === 'dist/cli.js' ? bundle : from;
    cpSync(copyFrom, dest);
  }

  if (existsSync(main)) {
    cpSync(main, join(staged, 'bin', 'snote-main.js'));
  }

  chmodSync(join(staged, 'bin', 'snote'), 0o755);

  const tarballPath = join(outDir, name + '.tgz');
  spawnSync('tar', ['-czf', tarballPath, '-C', stageDir, name]);

  return tarballPath;
}

// When run directly, create the release tarball
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const tarball = makeTarball({
      version: pkg.version,
      bundle: 'dist/cli.js',
      stageDir: 'dist/stage',
      outDir: '.',
    });
    console.log(basename(tarball));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
