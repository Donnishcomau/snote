/**
 * Build script for the CLI. Uses esbuild to produce a single bundled dist/cli.js.
 *
 * @typedef {{ entry?: string, contents?: string, outfile: string }} BundleOpts
 */

import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const BANNER = [
  '#!/usr/bin/env node',
  "import { createRequire as __cr } from 'node:module';",
  'const require = __cr(import.meta.url);',
].join('\n');

/**
 * @returns {import('esbuild').Plugin}
 */
function noDevtools() {
  return {
    name: 'no-devtools',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^react-devtools-core$/ }, () => ({
        path: 'devtools',
        namespace: 'stub',
      }));
      // T324: devtools is a dev-only path in Ink that esbuild would otherwise
      // inline along with the whole ws package; stub it to drop them.
      pluginBuild.onResolve({ filter: /devtools\.js$/ }, (args) =>
        args.importer.endsWith(path.join('ink', 'build', 'reconciler.js'))
          ? { path: 'devtools', namespace: 'stub' }
          : undefined
      );
      pluginBuild.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export default {}',
      }));
    },
  };
}

/**
 * T162 — simperium is CommonJS with exports.__esModule = true. Under this
 * repo's "type": "module" esbuild treats its default export as the whole
 * module.exports object, so the bundle calls an object as a function.
 * Answer the import with a virtual module that unwraps .default itself.
 * @returns {import('esbuild').Plugin}
 */
function simperiumInterop() {
  return {
    name: 'simperium-interop',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^simperium$/ }, (args) =>
        args.namespace === 'simperium-interop'
          ? undefined
          : { path: 'simperium', namespace: 'simperium-interop' }
      );
      pluginBuild.onLoad({ filter: /.*/, namespace: 'simperium-interop' }, () => ({
        resolveDir: process.cwd(),
        loader: 'js',
        contents:
          "let m; const load = () => (m ??= require('simperium')); export default function simperium_default(...a) { const x = load(); return (x && x.__esModule ? x.default : x)(...a); }",
      }));
    },
  };
}

/**
 * T172 — Ink's Unicode dependencies (Intl.Segmenter in 4 files, the
 * \p{RGI_Emoji} regex in string-width, and yoga-layout's fetch-loaded wasm)
 * pay their cost at import time even for pure-ASCII screens. Replace their
 * module text in the BUNDLE only: Segmenter calls go through an ASCII fast
 * path that builds segments by hand, the emoji regex is compiled on first
 * use, and the yoga shim takes its self-decoding base64 branch instead of
 * fetch (which would drag undici in at start-up).
 * @returns {import('esbuild').Plugin}
 */
function lazyIcu() {
  const SEGMENTER_FILTER =
    /node_modules\/(string-width\/index|wrap-ansi\/index|slice-ansi\/tokenize-ansi|@alcalzone\/ansi-tokenize\/build\/tokenize)\.js$/;
  const YOGA_FILTER = /yoga-wasm-base64-esm\.js$/;
  // In ASCII text without \r\n every character is its own grapheme, so
  // { segment: s[i], index: i, input: s } is exactly what Segmenter gives.
  const HELPERS = [
    "const __asciiSegments = (s) => ({ [Symbol.iterator]: function* () { for (let i = 0; i < s.length; i++) yield { segment: s[i], index: i, input: s }; }, containing: (i) => (i >= 0 && i < s.length ? { segment: s[i], index: i, input: s } : undefined) });",
    "const __isAscii = (s) => /^[\\x00-\\x7f]*$/.test(s) && !s.includes('\\r\\n');",
  ].join('\n');
  return {
    name: 'lazy-icu',
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: SEGMENTER_FILTER }, (args) => {
        let text = fs.readFileSync(args.path, 'utf8');
        // Only the files that actually build a top-level Segmenter get the
        // ASCII fast path; the rest keep their own Unicode tables untouched.
        if (!/^const (\w+) = new Intl\.Segmenter\(([^)]*)\);$/m.test(text)) {
          return undefined;
        }
        text = text.replace(
          /^const (\w+) = new Intl\.Segmenter\(([^)]*)\);$/gm,
          (_m, name, a) =>
            `let __real_${name}; const ${name} = { segment: (s) => (__isAscii(s) ? __asciiSegments(s) : (__real_${name} ??= new Intl.Segmenter(${a})).segment(s)) };`
        );
        text = text.replace(
          /^const rgiEmojiRegex = (\/.*\/v);$/m,
          (_m, re) =>
            `let __real_rgi; const rgiEmojiRegex = { test: (s) => (__real_rgi ??= ${re}).test(s) };`
        );
        return { contents: HELPERS + '\n' + text, loader: 'js' };
      });
      pluginBuild.onLoad({ filter: YOGA_FILTER }, (args) => ({
        contents: fs
          .readFileSync(args.path, 'utf8')
          .replaceAll('"function"!=typeof fetch', 'true'),
        loader: 'js',
      }));
    },
  };
}

/**
 * @param {BundleOpts} opts
 */
async function bundle(opts) {
  const { entry, contents, outfile } = opts;

  /** @type {import('esbuild').BuildOptions} */
  const buildOpts = {
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    logLevel: 'silent',
    banner: { js: BANNER },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [noDevtools(), simperiumInterop(), lazyIcu()],
  };

  if (contents) {
    buildOpts.stdin = {
      contents,
      resolveDir: process.cwd(),
      loader: 'tsx',
    };
  } else {
    buildOpts.entryPoints = [path.resolve(entry)];
  }

  await build(buildOpts);
}

/**
 * T174 — tiny launcher that turns on Node's compile cache and then imports
 * the real bundle. enableCompileCache only affects modules loaded AFTER the
 * call, so the entry must be this file, not the bundle itself.
 * @param {string} file where to write the launcher
 * @param {string} mainName the bundle's file name, in the same folder
 */
function writeLauncher(file, mainName) {
  const text = [
    '#!/usr/bin/env node',
    "import * as nodeModule from 'node:module';",
    "import { homedir } from 'node:os';",
    "import { join } from 'node:path';",
    'try {',
    "  nodeModule.enableCompileCache?.(join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'snote', 'compile-cache'));",
    '} catch {',
    '  // start without the cache',
    '}',
    "await import('./" + mainName + "');",
  ].join('\n');
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o755);
}

// When run directly, build the CLI entry file
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await bundle({ entry: 'src/cli/index.ts', outfile: 'dist/snote-main.js' });
  writeLauncher('dist/cli.js', 'snote-main.js');
}

export { bundle, writeLauncher };
