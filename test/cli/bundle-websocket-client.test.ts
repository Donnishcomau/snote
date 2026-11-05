/**
 * #572 (bundle diet): snote opens only the client socket (`w3cwebsocket`). The bare `websocket` import (src/core/websocket-provider.ts
 * and simperium's client.js) is answered with that class alone, so the package's server side (WebSocketServer, WebSocketRouter,
 * WebSocketRouterRequest, WebSocketRequest) is in neither the single-file bundle nor any plugin-dist file. A plugin-dist build
 * started from another directory takes every module from this repo's node_modules, never from that directory's.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { buildSplitDist, chunkGraph, type ChunkGraph } from '../helpers/bundle-size';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const SERVER_SIDE = ['WebSocketServer', 'WebSocketRouter', 'WebSocketRouterRequest', 'WebSocketRequest'];
const defines = (text: string, name: string): boolean => new RegExp(`function ${name}[0-9]*[(]`).test(text);
const dirs: string[] = [];
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
}, 60000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('#572 the bundle carries the websocket client only', () => {
  it('1: WHEN the bundle is built with `bundle` from scripts/build.mjs THEN its text defines `W3CWebSocket` once and none of `WebSocketServer`, `WebSocketRouter`, `WebSocketRouterRequest` and `WebSocketRequest`', () => {
    expect(single.match(/function W3CWebSocket[0-9]*[(]/g)?.length ?? 0).toBe(1);
    expect(SERVER_SIDE.filter((name) => defines(single, name))).toEqual([]);
  });

  it('2: WHEN the split plugin-dist is built THEN no file in it defines `WebSocketServer`, `WebSocketRouter`, `WebSocketRouterRequest` or `WebSocketRequest`, and the one file that defines `W3CWebSocket` is in the start set', () => {
    const files = distFiles(dist);
    expect(files).toContain('snote-main.js');
    const hits = files.flatMap((rel) => SERVER_SIDE.filter((name) => defines(fs.readFileSync(path.join(dist, rel), 'utf8'), name)).map((name) => `${rel}: ${name}`));
    expect(hits).toEqual([]);
    const client = files.filter((rel) => defines(fs.readFileSync(path.join(dist, rel), 'utf8'), 'W3CWebSocket'));
    expect(client.length).toBe(1);
    expect(graph.start.has(client[0])).toBe(true);
  });

  it("3: WHEN `import { w3cwebsocket } from 'websocket'` is bundled with `bundle` from scripts/build.mjs and run THEN it prints `function W3CWebSocket`", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-ws-probe-'));
    dirs.push(dir);
    const outfile = path.join(dir, 'probe.js');
    await bundle({ contents: "import { w3cwebsocket } from 'websocket';\nconsole.log(typeof w3cwebsocket, w3cwebsocket.name);\n", outfile });
    const run = spawnSync('node', [outfile], { encoding: 'utf8' });
    expect({ status: run.status, out: run.stdout.trim() }).toEqual({ status: 0, out: 'function W3CWebSocket' });
  });

  it('4: WHEN scripts/build-plugin-dist.mjs runs from an empty directory outside the repo THEN it exits 0, exactly one file defines `W3CWebSocket` and its SHA256SUMS equals the build from the repo root', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-ws-cwd-'));
    dirs.push(cwd);
    expect(path.relative(REPO, cwd).startsWith('..')).toBe(true);
    const out = path.join(cwd, 'out');
    const run = spawnSync('node', [path.join(REPO, 'scripts', 'build-plugin-dist.mjs'), out], { cwd, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(distFiles(out).filter((rel) => defines(fs.readFileSync(path.join(out, rel), 'utf8'), 'W3CWebSocket')).length).toBe(1);
    expect(fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8')).toBe(fs.readFileSync(path.join(dist, 'SHA256SUMS'), 'utf8'));
  }, 60000);
});
