/**
 * #68diet: chalk 5 (Ink's) carries a vendored copy of ansi-styles that is byte for byte the ansi-styles the build already
 * keeps, so the build answers chalk's `#ansi-styles` and `./vendor/ansi-styles/index.js` with that one copy. A vendored
 * file that differs, or a package the table does not name, keeps its own copy.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle, vendoredIdentical } from '../../scripts/build.mjs';
import { buildSplitDist } from '../helpers/bundle-size';

const dirs: string[] = [];
let single = '';
let split = '';

/** The module lines esbuild writes (`// <path>`), cut back to start at the first `node_modules/`. */
const modules = (text: string): string[] =>
  [...new Set(text.split('\n').filter((l) => l.startsWith('// ') && l.includes('node_modules/')).map((l) => l.slice(l.indexOf('node_modules/'))))].sort();
const ansiCopies = (text: string): string[] => modules(text).filter((m) => m.includes('ansi-styles/'));

/** A tree with `host` (nested `x`) and the packages `c` and `d`, each vendoring `x` as `#x` and `./vendor/x/index.js`. */
function fixture(vendored: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-vendored-'));
  dirs.push(root);
  const put = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const x = "export default (s) => 'x:' + s;\n";
  put('node_modules/host/package.json', JSON.stringify({ name: 'host', version: '1.0.0', type: 'module', main: 'index.js' }));
  put('node_modules/host/index.js', "import x from 'x';\nexport const host = () => x('host');\n");
  put('node_modules/host/node_modules/x/package.json', JSON.stringify({ name: 'x', version: '1.0.0', type: 'module', main: 'index.js' }));
  put('node_modules/host/node_modules/x/index.js', x);
  for (const pkg of ['c', 'd']) {
    put(`node_modules/${pkg}/package.json`, JSON.stringify({ name: pkg, version: '1.0.0', type: 'module', main: 'index.js', imports: { '#x': './vendor/x/index.js' } }));
    put(`node_modules/${pkg}/index.js`, `import x from '#x';\nexport { default as y } from './vendor/x/index.js';\nexport const ${pkg} = () => x('${pkg}');\n`);
    put(`node_modules/${pkg}/vendor/x/index.js`, pkg === 'c' ? vendored : x);
  }
  put('entry.js', "import { host } from 'host';\nimport { c } from 'c';\nimport { d } from 'd';\nconsole.log(host(), c(), d());\n");
  return root;
}

async function bundleFixture(root: string): Promise<string> {
  const r = await build({
    entryPoints: [path.join(root, 'entry.js')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    absWorkingDir: root, plugins: [vendoredIdentical([{ importer: 'c', specifiers: ['#x', './vendor/x/index.js'], package: 'x', host: 'host' }], root)],
  });
  return r.outputFiles[0].text;
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-vendored-'));
  dirs.push(dir);
  const outfile = path.join(dir, 'cli.js');
  await bundle({ entry: 'src/cli/index.ts', outfile });
  single = fs.readFileSync(outfile, 'utf8');
  const dist = await buildSplitDist();
  dirs.push(dist);
  const js = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? js(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  split = js(dist).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}, 60000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('#68diet a vendored copy identical to a kept package ships once', () => {
  it('1: WHEN the single-file bundle is built with `bundle` from `scripts/build.mjs` THEN its only ansi-styles file is `node_modules/wrap-ansi/node_modules/ansi-styles/index.js`', () => {
    expect(ansiCopies(single)).toEqual(['node_modules/wrap-ansi/node_modules/ansi-styles/index.js']);
  });

  it('2: WHEN the split plugin-dist is built THEN its .js files together hold one ansi-styles file, `node_modules/wrap-ansi/node_modules/ansi-styles/index.js`', () => {
    expect(ansiCopies(split)).toEqual(['node_modules/wrap-ansi/node_modules/ansi-styles/index.js']);
  });

  it('3: WHEN the table names `c` and its vendored `x` is byte-identical to the host copy THEN the bundle holds the host copy and `d`s own copy, and not `node_modules/c/vendor/x/index.js`', async () => {
    const text = await bundleFixture(fixture("export default (s) => 'x:' + s;\n"));
    expect(modules(text).filter((m) => m.endsWith('x/index.js'))).toEqual(['node_modules/d/vendor/x/index.js', 'node_modules/host/node_modules/x/index.js']);
  });

  it('4: WHEN the vendored `x` of `c` differs by one byte THEN the bundle keeps `node_modules/c/vendor/x/index.js` too', async () => {
    const text = await bundleFixture(fixture("export default (s) => 'x;' + s;\n"));
    expect(modules(text).filter((m) => m.endsWith('x/index.js'))).toEqual(['node_modules/c/vendor/x/index.js', 'node_modules/d/vendor/x/index.js', 'node_modules/host/node_modules/x/index.js']);
  });
});
