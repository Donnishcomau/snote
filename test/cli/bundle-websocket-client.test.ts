/**
 * #615 item 3 (owner, 9 Nov: the Apache-2.0 `websocket` package must not ship in the GPL-2.0-only build): snote opens its
 * sync socket with its own client (`SnoteSocket`, src/core/websocket-provider.ts). simperium's client.js still names
 * `websocket` in its default provider, which snote never calls; the build answers that require with a stub that throws, so
 * no file of the package is in the single-file bundle or in any plugin-dist file. (#572 before: the client class only.)
 * A plugin-dist build started from another directory takes every module from this repo's node_modules.
 * The stub is evaluated only if simperium's default provider is called: a bundled sync store connects to the fake
 * server with snote's own socket (test 5).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import pkg from '../../package.json';
import { bundle } from '../../scripts/build.mjs';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildSplitDist, chunkGraph, type ChunkGraph } from '../helpers/bundle-size';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const STUB = 'snote does not ship the websocket package';
const fromWebsocket = (text: string): string[] => text.split('\n').filter((l) => /^\/\/ \S*node_modules\/websocket\//.test(l));
const definesClient = (text: string): boolean => /^ {0,2}var SnoteSocket = class|^export class SnoteSocket|class SnoteSocket \{/m.test(text);
// test 5: the sync store (src/core/store.ts passes snoteSocketOptions to simperium), bundled like the product, prints `connected` once synced
const STORE_PROBE = [
  "import { makeStore } from './src/core/store';",
  "const store = makeStore({ sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', clientOptions: { url: process.argv[2] }, noteEditDelayMs: 10 } });",
  "const tick = () => { if (store.getState().simperium.connected) { console.log('connected'); process.exit(0); } };",
  'store.subscribe(tick);',
  'tick();',
].join('\n');
const dirs: string[] = [];
const children: ChildProcess[] = [];
const fakes: FakeSimperiumServer[] = [];
let storeProbe = '';
let single = '';
let dist = '';
let graph: ChunkGraph;

function distFiles(dir: string, rel = ''): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? distFiles(dir, path.join(rel, d.name)) : d.name.endsWith('.js') ? [path.join(rel, d.name)] : []));
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-ws-'));
  dirs.push(dir);
  await bundle({ entry: 'src/cli/index.ts', outfile: path.join(dir, 'cli.js') });
  single = fs.readFileSync(path.join(dir, 'cli.js'), 'utf8');
  dist = await buildSplitDist();
  dirs.push(dist);
  graph = chunkGraph(dist);
  storeProbe = path.join(dir, 'store-probe.js');
  await bundle({ contents: STORE_PROBE, outfile: storeProbe });
}, 60000);

afterAll(() => {
  for (const child of children) child.kill();
  for (const fake of fakes) fake.stop();
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('#615 no line of the websocket package ships', () => {
  it('1: WHEN the bundle is built with `bundle` from scripts/build.mjs THEN it has no `node_modules/websocket/` file, holds the stub text `snote does not ship the websocket package` once and defines `SnoteSocket` once', () => {
    expect(fromWebsocket(single)).toEqual([]);
    expect(single.split(STUB).length - 1).toBe(1);
    expect(single.match(/var SnoteSocket = class/g)?.length ?? 0).toBe(1);
  });

  it('2: WHEN the split plugin-dist is built THEN no file in it has a `node_modules/websocket/` file, and the one file that defines `SnoteSocket` is in the start set', () => {
    const files = distFiles(dist);
    expect(files).toContain('snote-main.js');
    expect(files.flatMap((rel) => fromWebsocket(fs.readFileSync(path.join(dist, rel), 'utf8')).map((l) => `${rel}: ${l}`))).toEqual([]);
    const client = files.filter((rel) => definesClient(fs.readFileSync(path.join(dist, rel), 'utf8')));
    expect(client.length).toBe(1);
    expect(graph.start.has(client[0])).toBe(true);
  });

  it("3: WHEN `import { w3cwebsocket } from 'websocket'` is bundled with `bundle` from scripts/build.mjs and run THEN it exits non-zero with `snote does not ship the websocket package` on stderr", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-ws-probe-'));
    dirs.push(dir);
    const outfile = path.join(dir, 'probe.js');
    await bundle({ contents: "import { w3cwebsocket } from 'websocket';\nconsole.log(typeof w3cwebsocket);\n", outfile });
    const run = spawnSync('node', [outfile], { encoding: 'utf8' });
    expect({ failed: run.status !== 0, stub: run.stderr.includes(STUB), out: run.stdout }).toEqual({ failed: true, stub: true, out: '' });
  });

  it('4: WHEN scripts/build-plugin-dist.mjs runs from an empty directory outside the repo THEN it exits 0, exactly one file defines `SnoteSocket` and its SHA256SUMS equals the build from the repo root', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-ws-cwd-'));
    dirs.push(cwd);
    expect(path.relative(REPO, cwd).startsWith('..')).toBe(true);
    const out = path.join(cwd, 'out');
    const run = spawnSync('node', [path.join(REPO, 'scripts', 'build-plugin-dist.mjs'), out], { cwd, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(distFiles(out).filter((rel) => definesClient(fs.readFileSync(path.join(out, rel), 'utf8'))).length).toBe(1);
    expect(fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8')).toBe(fs.readFileSync(path.join(dist, 'SHA256SUMS'), 'utf8'));
  }, 60000);

  it('5: WHEN the sync store (`makeStore` from src/core/store.ts) is bundled with `bundle` from scripts/build.mjs and run against the fake sync server on localhost THEN it prints `connected` and the handshake carries `user-agent` `snote/` + version, so the websocket stub is never evaluated', async () => {
    const fake = new FakeSimperiumServer();
    fakes.push(fake);
    const { url } = await fake.start();
    const child = spawn('node', [storeProbe, url], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let out = '';
    let err = '';
    child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    await expect.poll(() => ({ out, stub: err.includes(STUB), ua: fake.handshakeHeaders[0]?.['user-agent'] }), { timeout: 2500 }).toEqual({ out: 'connected\n', stub: false, ua: `snote/${pkg.version}` });
  });
});
