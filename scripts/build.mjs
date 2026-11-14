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
 * #615 item 3 (owner, 9 Nov: the Apache-2.0 `websocket` package must not ship in the GPL-2.0-only build): snote opens its
 * sync socket with its own client (src/core/websocket-provider.ts). simperium's client.js still names `websocket` in its
 * default provider, which snote never calls because every client gets snote's provider (store.ts), so that require is
 * answered with a stub that throws and no line of the package is bundled.
 * proof: test/cli/bundle-websocket-client.test.ts
 * @returns {import('esbuild').Plugin}
 */
function websocketClientOnly() {
  return {
    name: 'websocket-client-only',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^websocket$/ }, () => ({ path: 'websocket', namespace: 'websocket-not-shipped' }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'websocket-not-shipped' }, () => ({
        loader: 'js',
        contents: "throw new Error('snote does not ship the websocket package');",
      }));
    },
  };
}

/**
 * #713 (bundle diet): npm keeps one nested copy of a package under each dependent when the root slot holds another
 * version (ansi-styles 6.2.3 sits four times under wrap-ansi, slice-ansi, @alcalzone/ansi-tokenize and
 * react-ink-textarea, because the root holds the dev-only 4.3.0). Each listed package is answered with the copy its
 * host package resolves (for the same import kind), but only when the importer's own copy has the same version; any
 * other copy resolves as before. The table is data: add a row, not code.
 * proof: test/cli/bundle-dedupe.test.ts
 */
const DEDUPE = { 'ansi-styles': 'wrap-ansi' };

/** @param {string} file a resolved file @param {string} name its package name @returns {{ dir: string, version: string } | undefined} */
function packageOf(file, name) {
  const mark = `${path.sep}node_modules${path.sep}${name.split('/').join(path.sep)}${path.sep}`;
  const at = file.lastIndexOf(mark);
  if (at < 0) return undefined;
  const dir = file.slice(0, at + mark.length - 1);
  return { dir, version: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version };
}

/**
 * @param {Record<string, string>} [table] package name -> the host package whose copy is kept
 * @param {string} [root] the folder the host packages resolve from
 * @returns {import('esbuild').Plugin}
 */
function dedupeIdentical(table = DEDUPE, root = repoRoot) {
  const names = Object.keys(table);
  return {
    name: 'dedupe-identical',
    setup(pluginBuild) {
      if (names.length === 0) return;
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      /** @type {Map<string, string | undefined>} */
      const kept = new Map();
      pluginBuild.onResolve({ filter: new RegExp(`^(${names.map(esc).join('|')})$`) }, async (args) => {
        if (args.pluginData === 'dedupe-identical') return undefined;
        const own = await pluginBuild.resolve(args.path, { kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, pluginData: 'dedupe-identical' });
        if (own.errors.length > 0 || !own.path) return undefined;
        const key = `${args.path}\0${args.kind}`;
        if (!kept.has(key)) {
          const hostDir = path.join(root, 'node_modules', ...table[args.path].split('/'));
          const host = await pluginBuild.resolve(args.path, { kind: args.kind, resolveDir: hostDir, pluginData: 'dedupe-identical' });
          kept.set(key, host.errors.length > 0 ? undefined : host.path);
        }
        const keep = kept.get(key);
        if (!keep || keep === own.path) return undefined;
        const a = packageOf(own.path, args.path);
        const b = packageOf(keep, args.path);
        if (!a || !b || a.version !== b.version) return undefined;
        return { path: keep };
      });
    },
  };
}

/**
 * #68diet (pays for #68's release check, no cap raise): chalk 5 (Ink's) carries its own copy of ansi-styles in
 * source/vendor/ and imports it as `#ansi-styles` and `./vendor/ansi-styles/index.js`. That file is byte for byte the
 * ansi-styles index.js the DEDUPE table keeps, so the same code shipped twice. Each row names the importing package, the
 * specifiers of its vendored copy, and the package whose copy (as the host resolves it) answers them; the answer is given
 * only when both files are byte-identical at build time, else the vendored copy resolves as before. Rows are data.
 * proof: test/cli/bundle-vendored-dedupe.test.ts
 */
const VENDORED_SAME = [{ importer: 'chalk', specifiers: ['#ansi-styles', './vendor/ansi-styles/index.js'], package: 'ansi-styles', host: 'wrap-ansi' }];

/**
 * @param {{ importer: string, specifiers: string[], package: string, host: string }[]} [rows]
 * @param {string} [root] the folder the host packages resolve from
 * @returns {import('esbuild').Plugin}
 */
function vendoredIdentical(rows = VENDORED_SAME, root = repoRoot) {
  return {
    name: 'vendored-identical',
    setup(pluginBuild) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      for (const row of rows) {
        pluginBuild.onResolve({ filter: new RegExp(`^(${row.specifiers.map(esc).join('|')})$`) }, async (args) => {
          if (args.pluginData === 'vendored-identical' || !packageOf(args.importer, row.importer)) return undefined;
          const own = await pluginBuild.resolve(args.path, { kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, pluginData: 'vendored-identical' });
          if (own.errors.length > 0 || !own.path) return undefined;
          const host = await pluginBuild.resolve(row.package, { kind: args.kind, resolveDir: path.join(root, 'node_modules', ...row.host.split('/')), pluginData: 'vendored-identical' });
          if (host.errors.length > 0 || !host.path || host.path === own.path) return undefined;
          return fs.readFileSync(own.path).equals(fs.readFileSync(host.path)) ? { path: host.path } : undefined;
        });
      }
    },
  };
}

/**
 * #30 (L5-0b, second bundle offset for the update chain): simperium and vendor/simplenote call only uuid's v4(), with no
 * argument (test/cli/uuid-no-buf.test.ts), but `require('uuid')` of uuid 3.3.3 also bundles v1 and its byte helpers. A
 * bare `uuid` or `uuid/v4` is answered with Node's own crypto.randomUUID (the same RFC 4122 version 4 text from the
 * same system CSPRNG), so no uuid file is bundled; a call with any argument throws instead of ignoring it.
 * proof: test/cli/bundle-uuid-crypto.test.ts
 * @returns {import('esbuild').Plugin}
 */
function uuidNodeCrypto() {
  return {
    name: 'uuid-node-crypto',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^uuid(\/v4)?$/ }, () => ({ path: 'uuid', namespace: 'uuid-node-crypto' }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'uuid-node-crypto' }, () => ({
        loader: 'js',
        contents:
          "const { randomUUID } = require('node:crypto'); function v4(...a) { if (a.length > 0) throw new Error('snote: uuid v4 takes no arguments'); return randomUUID(); } module.exports = v4; module.exports.v4 = v4;",
      }));
    },
  };
}

const DEBUG_FOLD = ['websocket'];

/**
 * #816 (start-path cut): the `debug` package's src/index.js picks src/browser.js only in an Electron renderer, a browser
 * or nwjs, and src/node.js everywhere else, but esbuild does not see that runtime choice and bundles both. snote runs on
 * Node only, so a bare `debug` import is answered with src/node.js of the copy the importer already resolves (debug 4 for
 * vendor/simplenote); any other resolution is left as it is.
 * #30 (L5-0, bundle offset for the update chain): a package listed in DEBUG_FOLD gets the root copy's src/node.js (debug
 * 4.4.3) instead of its own nested debug (websocket's 2.6.9 with its ms 2.0.0, about 10 KB); websocket only calls
 * `require('debug')(name)` and reads `.enabled`, which debug 4 keeps. The table is data: add a row, not code.
 * proof: test/cli/bundle-debug-node.test.ts
 * @param {string[]} [fold] the packages whose nested debug is answered with the root copy
 * @param {string} [root] the folder whose node_modules/debug is the root copy
 * @returns {import('esbuild').Plugin}
 */
function debugNodeOnly(fold = DEBUG_FOLD, root = repoRoot) {
  return {
    name: 'debug-node-only',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^debug$/ }, async (args) => {
        if (args.pluginData === 'debug-node-only') return undefined;
        const own = await pluginBuild.resolve(args.path, { kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, pluginData: 'debug-node-only' });
        if (own.errors.length > 0 || !own.path || !own.path.endsWith(path.join('debug', 'src', 'index.js'))) return undefined;
        const host = fold.find((name) => own.path.includes(`${path.sep}node_modules${path.sep}${name}${path.sep}node_modules${path.sep}debug${path.sep}`));
        if (host !== undefined) return { path: path.join(root, 'node_modules', 'debug', 'src', 'node.js') };
        return { path: path.join(path.dirname(own.path), 'node.js') };
      });
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
    plugins: [noDevtools(), simperiumInterop(), lazyIcu(), simperiumNoHttp(), websocketClientOnly(), vendoredIdentical(), dedupeIdentical(), debugNodeOnly(), uuidNodeCrypto()],
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

export { bundle, writeLauncher, refuseOddOutput, noDevtools, simperiumInterop, simperiumNoHttp, lazyIcu, websocketClientOnly, vendoredIdentical, dedupeIdentical, debugNodeOnly, uuidNodeCrypto, BANNER };
