/**
 * #713 (bundle diet): the build answers each package in its dedupe table with one copy when every nested copy has the
 * same version, so the bundle and the plugin-dist start set carry ansi-styles once instead of four times; a copy with
 * another version resolves as before.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle, dedupeIdentical } from '../../scripts/build.mjs';
import { buildSplitDist } from '../helpers/bundle-size';

const dirs: string[] = [];
let single = '';
let split = '';

/** The module lines esbuild writes for files of the package `name` (`// <path>/node_modules/<name>/<file>`). */
const copies = (text: string, name: string): string[] =>
  [...new Set(text.split('\n').filter((l) => l.startsWith('// ') && l.includes(`node_modules/${name}/`)).map((l) => l.slice(3).replace(/^(?:\.\.\/)+/, '')))].sort();

/** A tree with packages `host` and `other`, each holding its own nested copy of `x` at the given versions. */
function fixture(hostVersion: string, otherVersion: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-dedupe-'));
  dirs.push(root);
  const put = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  for (const [pkg, version] of [['host', hostVersion], ['other', otherVersion]]) {
    put(`node_modules/${pkg}/package.json`, JSON.stringify({ name: pkg, version: '1.0.0', type: 'module', main: 'index.js' }));
    put(`node_modules/${pkg}/index.js`, `import x from 'x';\nexport const ${pkg} = () => x('${pkg}');\n`);
    put(`node_modules/${pkg}/node_modules/x/package.json`, JSON.stringify({ name: 'x', version, type: 'module', main: 'index.js' }));
    put(`node_modules/${pkg}/node_modules/x/index.js`, `export default (s) => 'x${version}:' + s;\n`);
  }
  put('entry.js', "import { host } from 'host';\nimport { other } from 'other';\nconsole.log(host(), other());\n");
  return root;
}

async function bundleFixture(root: string, table: Record<string, string>): Promise<string> {
  const r = await build({
    entryPoints: [path.join(root, 'entry.js')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    absWorkingDir: root, plugins: [dedupeIdentical(table, root)],
  });
  return r.outputFiles[0].text;
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-dedupe-'));
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

describe('#713 one copy of each identical nested package', () => {
  it('1: WHEN the single-file bundle is built with `bundle` from `scripts/build.mjs` THEN it holds exactly one copy of `ansi-styles`, the one under `wrap-ansi`', () => {
    expect(copies(single, 'ansi-styles')).toEqual(['node_modules/wrap-ansi/node_modules/ansi-styles/index.js']);
  });

  it('2: WHEN the split plugin-dist is built THEN its .js files together hold exactly one copy of `ansi-styles`, the one under `wrap-ansi`', () => {
    expect(copies(split, 'ansi-styles')).toEqual(['node_modules/wrap-ansi/node_modules/ansi-styles/index.js']);
  });

  it('3: WHEN two packages each hold a nested `x` at version `1.0.0` and the table names `x` THEN the bundle holds only the host copy', async () => {
    const text = await bundleFixture(fixture('1.0.0', '1.0.0'), { x: 'host' });
    expect(copies(text, 'x')).toEqual(['node_modules/host/node_modules/x/index.js']);
  });

  it('4: WHEN the nested copies of `x` are `1.0.0` and `2.0.0` THEN the bundle holds both copies, each package keeping its own', async () => {
    const text = await bundleFixture(fixture('1.0.0', '2.0.0'), { x: 'host' });
    expect(copies(text, 'x')).toEqual(['node_modules/host/node_modules/x/index.js', 'node_modules/other/node_modules/x/index.js']);
    expect(text).toContain('x2.0.0:');
  });
});
