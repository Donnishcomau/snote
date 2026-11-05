/**
 * Build script for the CLI. Uses esbuild to produce a single bundled dist/cli.js.
 *
 * @typedef {{ entry?: string, contents?: string, outfile: string }} BundleOpts
 */

import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// #572: the virtual modules below resolve their requires from this repo, never from the directory a build starts in
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
      // devtools is a dev-only path in Ink that esbuild would otherwise
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
 * simperium is CommonJS with exports.__esModule = true. Under this
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
        resolveDir: repoRoot, // #572: simperium from this repo
        loader: 'js',
        contents:
          "let m; const load = () => (m ??= require('simperium')); export default function simperium_default(...a) { const x = load(); return (x && x.__esModule ? x.default : x)(...a); }",
      }));
    },
  };
}

/**
 * #198: simperium's auth.js requires its
 * ./http-request helper, an https.request POST with no timeout that appends
 * every response chunk to a string with no size limit. snote never calls it
 * (login is src/core/auth.ts), but the package index re-exports Auth, so the
 * bundle shipped it. Answer that one require with a stub that rejects.
 * proof: test/packaging/plugin-dist-no-unbounded-request.test.ts
 * @returns {import('esbuild').Plugin}
 */
function simperiumNoHttp() {
  return {
    name: 'simperium-no-http',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^\.\/http-request$/ }, (args) =>
        args.importer.includes(path.join('node_modules', 'simperium', 'lib'))
          ? { path: 'http-request', namespace: 'simperium-no-http' }
          : undefined
      );
      pluginBuild.onLoad({ filter: /.*/, namespace: 'simperium-no-http' }, () => ({
        loader: 'js',
        contents:
          "exports.__esModule = true; exports.default = function () { return Promise.reject(new Error('snote does not ship the simperium http helper')); };",
      }));
    },
  };
}

/**
 * Ink's Unicode dependencies (Intl.Segmenter in 4 files, the
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
 * #572 (bundle diet): snote opens only the client socket, `w3cwebsocket` (src/core/websocket-provider.ts; simperium's
 * client.js asks for the same export). The package index also loads its server, router and request classes (about 34 KB
 * that no snote path calls), so the bare `websocket` import is answered with the client class alone.
 * proof: test/cli/bundle-websocket-client.test.ts
 * @returns {import('esbuild').Plugin}
 */
function websocketClientOnly() {
  return {
    name: 'websocket-client-only',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^websocket$/ }, () => ({ path: 'websocket', namespace: 'websocket-client-only' }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'websocket-client-only' }, () => ({
        resolveDir: repoRoot, // #572: websocket from this repo
        loader: 'js',
        contents: "module.exports = { w3cwebsocket: require('websocket/lib/W3CWebSocket') };",
      }));
    },
  };
}

/**
 * Refuse to write to a path that exists and is not a regular file (a symlink,
 * a FIFO, a device, a folder). lstat, never followed: a link planted at an
 * output path would otherwise send the write to wherever it points. Refuse,
 * never repair: the entry is left as it is. A missing path is fine. (#426, #412)
 * proof: test/packaging/build-output-links.test.ts
 * @param {string} file the output path about to be written
 */
function refuseOddOutput(file) {
  // path.resolve drops a trailing separator, a '/.' and '//', which make the OS follow a final link; the raw path is
  // lstat'ed too because writeFileSync follows a '..' after a link physically. proof: test/packaging/build-outdir-spellings.test.ts
  const abs = path.resolve(file);
  for (const p of [abs, file]) {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') continue;
      throw err;
    }
    if (!st.isFile()) throw new Error(`refusing to write ${file}: it is a symlink or special file`);
  }
}

/**
 * @param {BundleOpts} opts
 */
async function bundle(opts) {
  const { entry, contents, outfile } = opts;
  refuseOddOutput(outfile);

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
    plugins: [noDevtools(), simperiumInterop(), lazyIcu(), simperiumNoHttp(), websocketClientOnly()],
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
 * tiny launcher that turns on Node's compile cache and then imports
 * the real bundle. enableCompileCache only affects modules loaded AFTER the
 * call, so the entry must be this file, not the bundle itself.
 * @param {string} file where to write the launcher
 * @param {string} mainName the bundle's file name, in the same folder
 */
function writeLauncher(file, mainName) {
  refuseOddOutput(file);
  const text = [
    '#!/usr/bin/env node',
    "import * as nodeModule from 'node:module';",
    "import * as fs from 'node:fs';",
    "import { homedir } from 'node:os';",
    "import { join } from 'node:path';",
    'try {',
    "  const d = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'snote', 'compile-cache');",
    '  fs.mkdirSync(d, { recursive: true });',
    '  if (!fs.lstatSync(d).isSymbolicLink()) {',
    '    const fd = fs.openSync(d, fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);',
    '    fs.fchmodSync(fd, 0o700);',
    '    fs.closeSync(fd);',
    '    nodeModule.enableCompileCache?.(d);',
    '  }',
    '} catch {}',
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

export { bundle, writeLauncher, refuseOddOutput, noDevtools, simperiumInterop, simperiumNoHttp, lazyIcu, websocketClientOnly, BANNER };
