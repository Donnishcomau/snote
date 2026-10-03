/**
 * Build script for the pre-built plugin distribution. Unlike scripts/build.mjs
 * (a single bundled dist/cli.js), this one splits the app into plain,
 * readable .js chunks small enough for the Omarchy marketplace scanner,
 * plus a cli.js launcher and a VERSION file.
 *
 * Run directly:
 *   node scripts/build-plugin-dist.mjs [outDir]        build (default plugin-dist)
 *   node scripts/build-plugin-dist.mjs --check <dir>   build into a temp dir,
 *     compare the built files with <dir> (SHA256SUMS itself excluded - a
 *     stale manifest is rewritten in place from the fresh build) and exit 0
 *     when identical; otherwise print the first differing path and exit 1.
 */

import { build } from 'esbuild';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BANNER, lazyIcu, noDevtools, simperiumInterop, writeLauncher } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/**
 * The websocket package's lib/BufferUtil.js and lib/Validation.js try their
 * native addons first and print "Run npm install." on stderr when an addon is
 * missing (the addons are never built here). esbuild keeps that string even
 * though it rewrites the fallback requires, and the marketplace scanner
 * reports it as a package-manager capability. Resolve the ./BufferUtil and
 * ./Validation requires (importer inside the package's lib folder) to the
 * package's own fallback files, and answer the addon requires the loaders
 * still make with an empty stub so the catch chains never fire.
 * @returns {import('esbuild').Plugin}
 */
function websocketFallback() {
  const inWsLib = (args) =>
    args.importer.includes(path.join('node_modules', 'websocket', 'lib'));
  /** @type {Record<string, string>} */
  const FALLBACKS = {
    './BufferUtil': 'BufferUtil.fallback.js',
    './Validation': 'Validation.fallback.js',
  };
  return {
    name: 'websocket-fallback',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^\.\/(BufferUtil|Validation)$/ }, (args) =>
        inWsLib(args)
          ? { path: path.join(repoRoot, 'node_modules', 'websocket', 'lib', FALLBACKS[args.path]) }
          : undefined
      );
      pluginBuild.onResolve({ filter: /^\.\.\/build\/(Release|default)\/(bufferutil|validation)$/ }, (args) =>
        inWsLib(args) ? { path: args.path, namespace: 'websocket-addon-stub' } : undefined
      );
      pluginBuild.onLoad({ filter: /.*/, namespace: 'websocket-addon-stub' }, () => ({
        contents: 'module.exports = {}',
        loader: 'js',
      }));
    },
  };
}

/**
 * Build the pre-built plugin distribution into outDir: one esbuild run that
 * splits the CLI entry and the large dependencies into readable chunks, a
 * cli.js launcher, a VERSION file and SHA256SUMS. Any SHA256SUMS already in
 * outDir is removed first: the manifest hashes the built content, so an old
 * one (still listing stale files) must never leak into the new set.
 * @param {string} outDir directory to write the distribution into
 */
async function buildPluginDist(outDir) {
  fs.rmSync(path.join(outDir, 'SHA256SUMS'), { force: true });
  const wsLib = path.join(repoRoot, 'node_modules', 'websocket', 'lib', 'websocket.js');
  /** @type {Record<string, string>} */
  const entryPoints = {
    'snote-main': path.join(repoRoot, 'src', 'cli', 'index.ts'),
    'react-reconciler': 'react-reconciler',
    'yoga-layout': 'yoga-layout',
    ink: 'ink',
    simperium: 'simperium',
    websocket: wsLib,
  };

  /** @type {import('esbuild').BuildOptions} */
  const buildOpts = {
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    splitting: true,
    outdir: outDir,
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    logLevel: 'silent',
    banner: { js: BANNER },
    define: { 'process.env.NODE_ENV': '"production"' },
    entryPoints,
    plugins: [noDevtools(), simperiumInterop(), lazyIcu(), websocketFallback()],
  };

  await build(buildOpts);

  writeLauncher(path.join(outDir, 'cli.js'), 'snote-main.js');

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(outDir, 'VERSION'), pkg.version + '\n');

  writeSha256Sums(outDir);
}

/**
 * Every file under dir (recursively), as { abs, rel } pairs with rel using
 * forward slashes so the sums are portable across platforms.
 * @param {string} dir directory to walk
 * @param {string} [base] root the relative paths are computed from
 * @returns {{abs: string, rel: string}[]}
 */
function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(abs, base));
    } else {
      out.push({ abs, rel: path.relative(base, abs).split(path.sep).join('/') });
    }
  }
  return out;
}

/**
 * SHA256 checksum of a file, lowercase hex.
 * @param {string} file file to hash
 * @returns {string}
 */
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Write SHA256SUMS into dir: one line per other file in it
 * (`<sha256>  <relative path>`, sorted by path); SHA256SUMS excludes itself.
 * @param {string} dir directory holding the built distribution
 */
function writeSha256Sums(dir) {
  const lines = listFiles(dir)
    .filter((f) => f.rel !== 'SHA256SUMS')
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .map((f) => sha256(f.abs) + '  ' + f.rel);
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), lines.length ? lines.join('\n') + '\n' : '');
}

/**
 * Compare a fresh build (into a temp directory) with dir: same relative file
 * names (SHA256SUMS aside), same bytes. A stale SHA256SUMS in dir - one that
 * no longer matches the files it lists - is rewritten from the fresh build
 * first, so it never masks a real difference.
 * @param {string} dir directory to compare the fresh build with
 * @returns {Promise<string | null>} null when identical, else the first
 * differing path (a missing path when a file is only in one of the two)
 */
async function compareFreshBuild(dir) {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-dist-check-'));
  try {
    await buildPluginDist(fresh);
    refreshStaleSums(dir, fresh);
    const built = listFiles(fresh)
      .map((f) => f.rel)
      .filter((rel) => rel !== 'SHA256SUMS')
      .sort();
    const existing = listFiles(dir)
      .map((f) => f.rel)
      .filter((rel) => rel !== 'SHA256SUMS')
      .sort();
    for (const rel of built) {
      if (!existing.includes(rel)) return rel;
    }
    for (const rel of existing) {
      if (!built.includes(rel)) return rel;
    }
    for (const rel of built) {
      if (!fs.readFileSync(path.join(fresh, rel)).equals(fs.readFileSync(path.join(dir, rel)))) {
        return rel;
      }
    }
    return null;
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }
}

/**
 * True when the SHA256SUMS in dir no longer matches the files it lists (a
 * missing file, an extra file or a changed hash). No manifest at all counts
 * as fresh; writeSha256Sums only ever creates or rewrites it as a whole.
 * @param {string} dir directory that holds a built distribution
 * @param {string} fresh directory that holds a freshly built one
 * @returns {boolean}
 */
function staleSums(dir, fresh) {
  const manifest = path.join(dir, 'SHA256SUMS');
  if (!fs.existsSync(manifest)) return false;
  const listed = fs
    .readFileSync(manifest, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      return match ? { hash: match[1], rel: match[2] } : null;
    });
  if (listed.some((entry) => entry === null)) return true;
  const entries = /** @type {{hash: string, rel: string}[]} */ (listed.filter((e) => e !== null));
  const present = new Set(listFiles(dir).map((f) => f.rel).filter((rel) => rel !== 'SHA256SUMS'));
  if (entries.length !== present.size) return true;
  return entries.some(
    (entry) => !present.has(entry.rel) || sha256(path.join(dir, entry.rel)) !== entry.hash
  );
}

/**
 * When staleSums says dir's manifest is stale, rewrite it from the fresh
 * build (the fresh manifest lists exactly the files buildPluginDist writes).
 * @param {string} dir directory holding a possibly stale manifest
 * @param {string} fresh directory holding a freshly built distribution
 */
function refreshStaleSums(dir, fresh) {
  if (staleSums(dir, fresh)) {
    fs.copyFileSync(path.join(fresh, 'SHA256SUMS'), path.join(dir, 'SHA256SUMS'));
  }
}

// When run directly: --check <dir> verifies a committed build against a
// fresh one; otherwise build into the directory given as the first argument.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv[2] === '--check') {
    const dir = path.resolve(process.argv[3] ?? 'plugin-dist');
    const diff = await compareFreshBuild(dir);
    if (diff === null) {
      process.exitCode = 0;
    } else {
      process.stdout.write(diff + '\n');
      process.exitCode = 1;
    }
  } else {
    await buildPluginDist(path.resolve(process.argv[2] ?? 'plugin-dist'));
  }
}

export { buildPluginDist, compareFreshBuild, listFiles, writeSha256Sums };
