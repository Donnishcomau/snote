/**
 * #816 (start-path cut): the build answers a bare `debug` import with that copy's src/node.js, so neither the single-file
 * bundle nor the plugin-dist carries debug's browser build (src/browser.js), which Node does not run; debug output under
 * DEBUG is written to stderr as before, and a `debug` package without src/index.js resolves as it always did.
 * #30 L5-0: websocket's nested debug 2.6.9 is folded onto the root debug 4 (scripts/build.mjs DEBUG_FOLD), and its logger still works.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle, debugNodeOnly } from '../../scripts/build.mjs';
import { buildSplitDist, chunkGraph } from '../helpers/bundle-size';

const dirs: string[] = [];
let single = '';
let splitAll = '';
let splitStart = '';

/** The `debug` module files esbuild names in a text (`// <path>/debug/src/<file>`), as repo-relative paths. */
const debugFiles = (text: string): string[] =>
  [...new Set(text.split('\n').filter((l) => /^\/\/ \S*node_modules\/(?:\S+\/)?debug\/src\//.test(l)).map((l) => l.slice(3).replace(/^(?:\.\.\/)+/, '')))].sort();

const tmp = (prefix: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

beforeAll(async () => {
  const dir = tmp('bundle-debug-');
  await bundle({ entry: 'src/cli/index.ts', outfile: path.join(dir, 'cli.js') });
  single = fs.readFileSync(path.join(dir, 'cli.js'), 'utf8');
  const dist = await buildSplitDist();
  dirs.push(dist);
  const graph = chunkGraph(dist);
  const all = (rel = ''): string[] =>
    fs.readdirSync(path.join(dist, rel), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? all(path.join(rel, d.name)) : d.name.endsWith('.js') ? [path.join(rel, d.name)] : []));
  splitAll = all().map((rel) => fs.readFileSync(path.join(dist, rel), 'utf8')).join('\n');
  splitStart = [...graph.start.keys()].map((rel) => fs.readFileSync(path.join(dist, rel), 'utf8')).join('\n');
}, 60000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('#816 debug is bundled for Node only', () => {
  it('1: WHEN the single-file bundle is built with `bundle` from scripts/build.mjs THEN its debug files are exactly `node_modules/debug/src/common.js` and `node_modules/debug/src/node.js` (#30 L5-0: no websocket/node_modules/debug and no websocket/node_modules/ms), with no `browser.js` and no `index.js`', () => {
    expect(debugFiles(single)).toEqual(['node_modules/debug/src/common.js', 'node_modules/debug/src/node.js']);
    expect(single.split('\n').filter((l) => /^\/\/ \S*node_modules\/websocket\/node_modules\//.test(l))).toEqual([]);
  });

  it('2: WHEN the split plugin-dist is built THEN no .js file in it holds a debug `browser.js` or `index.js`, and its start set holds `node_modules/debug/src/node.js`', () => {
    expect(debugFiles(splitAll).filter((f) => /\/(browser|index)\.js$/.test(f))).toEqual([]);
    expect(debugFiles(splitStart)).toContain('node_modules/debug/src/node.js');
  });

  it("3: WHEN `debugFactory('snote-t816')('hello')` is bundled with `bundle` and run with DEBUG `snote-t816` and DEBUG_COLORS `no` THEN stderr holds `snote-t816 hello` and stdout is empty; run without DEBUG THEN stderr is empty", async () => {
    const dir = tmp('bundle-debug-run-');
    const out = path.join(dir, 'probe.mjs');
    await bundle({ contents: "import debugFactory from 'debug';\ndebugFactory('snote-t816')('hello');\n", outfile: out });
    const env: NodeJS.ProcessEnv = { ...process.env, DEBUG_COLORS: 'no' };
    delete env.DEBUG;
    const on = spawnSync(process.execPath, [out], { encoding: 'utf8', env: { ...env, DEBUG: 'snote-t816' } });
    expect({ status: on.status, stdout: on.stdout, logged: on.stderr.includes('snote-t816 hello') }).toEqual({ status: 0, stdout: '', logged: true });
    const off = spawnSync(process.execPath, [out], { encoding: 'utf8', env });
    expect({ status: off.status, stderr: off.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('4: WHEN a package named `debug` has a root `index.js` and `node.js` (no src/index.js) THEN the plugin leaves its resolution alone and the bundle holds that file', async () => {
    const root = tmp('bundle-debug-fixture-');
    fs.mkdirSync(path.join(root, 'node_modules', 'debug'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'debug', 'package.json'), JSON.stringify({ name: 'debug', version: '9.9.9', main: 'index.js' }));
    fs.writeFileSync(path.join(root, 'node_modules', 'debug', 'index.js'), "module.exports = () => 'fixture-debug-root';\n");
    fs.writeFileSync(path.join(root, 'node_modules', 'debug', 'node.js'), "module.exports = () => 'fixture-debug-node';\n");
    fs.writeFileSync(path.join(root, 'entry.js'), "import d from 'debug';\nconsole.log(d());\n");
    const res = await build({ entryPoints: [path.join(root, 'entry.js')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', absWorkingDir: root, plugins: [debugNodeOnly()] });
    expect({ root: res.outputFiles[0].text.includes('fixture-debug-root'), node: res.outputFiles[0].text.includes('fixture-debug-node') }).toEqual({ root: true, node: false });
  });

  it("5: WHEN websocket's own logger (`BufferingLogger('websocket:t30', 7)` from websocket/lib/utils.js) is bundled with `bundle` and run with DEBUG `websocket:t30` and DEBUG_COLORS `no` THEN stderr holds `websocket:t30 ` and `7 - hello-t30` and stdout is empty; run without DEBUG THEN stderr is empty", async () => {
    const dir = tmp('bundle-debug-ws-');
    const out = path.join(dir, 'probe.mjs');
    await bundle({ contents: "import utils from 'websocket/lib/utils.js';\nconst log = utils.BufferingLogger('websocket:t30', 7);\nlog('hello-t30');\nlog.printOutput();\n", outfile: out });
    const env: NodeJS.ProcessEnv = { ...process.env, DEBUG_COLORS: 'no' };
    delete env.DEBUG;
    const on = spawnSync(process.execPath, [out], { encoding: 'utf8', env: { ...env, DEBUG: 'websocket:t30' } });
    expect({ status: on.status, stdout: on.stdout, name: on.stderr.includes('websocket:t30 '), line: on.stderr.includes('7 - hello-t30') }).toEqual({ status: 0, stdout: '', name: true, line: true });
    const off = spawnSync(process.execPath, [out], { encoding: 'utf8', env });
    expect({ status: off.status, stderr: off.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('6: WHEN a package NOT in the fold list nests its own `debug` with src/index.js and src/node.js THEN the bundle holds that nested src/node.js and not the root copy (only listed packages are folded)', async () => {
    const root = tmp('bundle-debug-nofold-');
    const mk = (dir: string, tag: string): void => {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'debug', version: '1.0.0', main: 'src/index.js' }));
      fs.writeFileSync(path.join(dir, 'src', 'index.js'), `module.exports = () => '${tag}-index';\n`);
      fs.writeFileSync(path.join(dir, 'src', 'node.js'), `module.exports = () => '${tag}-node';\n`);
    };
    mk(path.join(root, 'node_modules', 'debug'), 'fixture-root');
    mk(path.join(root, 'node_modules', 'other', 'node_modules', 'debug'), 'fixture-nested');
    fs.writeFileSync(path.join(root, 'node_modules', 'other', 'package.json'), JSON.stringify({ name: 'other', version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(path.join(root, 'node_modules', 'other', 'index.js'), "module.exports = require('debug');\n");
    fs.writeFileSync(path.join(root, 'entry.js'), "import d from 'other';\nconsole.log(d());\n");
    const res = await build({ entryPoints: [path.join(root, 'entry.js')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', absWorkingDir: root, plugins: [debugNodeOnly(['websocket'], root)] });
    const text = res.outputFiles[0].text;
    expect({ nested: text.includes('fixture-nested-node'), root: text.includes('fixture-root-node') }).toEqual({ nested: true, root: false });
  });
});
