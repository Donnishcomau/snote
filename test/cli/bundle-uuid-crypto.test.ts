/**
 * #30 L5-0b (second bundle offset for the update chain): the build answers a bare `uuid` or `uuid/v4` with Node's own
 * crypto.randomUUID (scripts/build.mjs uuidNodeCrypto), so neither the single-file bundle nor the plugin-dist carries a
 * uuid file; the ids keep the RFC 4122 version 4 form, and a call with an argument throws instead of ignoring it.
 * Callers pass no argument today: test/cli/uuid-no-buf.test.ts.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { buildSplitDist, chunkGraph } from '../helpers/bundle-size';

const dirs: string[] = [];
let single = '';
let splitAll = '';
let splitStart = '';

const tmp = (prefix: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
/** The module names esbuild writes as `// <name>` lines that belong to uuid (a node_modules/uuid file or the shim). */
const uuidModules = (text: string): string[] =>
  [...new Set(text.split('\n').filter((l) => /^\/\/ (\S*node_modules\/uuid\/\S+|uuid-node-crypto:\S+)$/.test(l)).map((l) => l.slice(3).replace(/^(?:\.\.\/)+/, '')))].sort();
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeAll(async () => {
  const dir = tmp('bundle-uuid-');
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

describe('#30 L5-0b uuid is answered by node:crypto', () => {
  it('1: WHEN the single-file bundle is built with `bundle` from scripts/build.mjs THEN its only uuid module is `uuid-node-crypto:uuid` (no node_modules/uuid file)', () => {
    expect(uuidModules(single)).toEqual(['uuid-node-crypto:uuid']);
  });

  it('2: WHEN the split plugin-dist is built THEN no .js file in it holds a node_modules/uuid file, and its start set holds `uuid-node-crypto:uuid`', () => {
    expect(uuidModules(splitAll)).toEqual(['uuid-node-crypto:uuid']);
    expect(uuidModules(splitStart)).toEqual(['uuid-node-crypto:uuid']);
  });

  it("3: WHEN `import { v4 } from 'uuid'` and `import v4 from 'uuid/v4'` are bundled with `bundle` and run THEN four calls give four different ids of the version 4 form, and a call with an argument (`{}` or `{ random }`) throws `snote: uuid v4 takes no arguments`", async () => {
    const dir = tmp('bundle-uuid-probe-');
    const out = path.join(dir, 'probe.mjs');
    const probe = [
      "import { v4 as named } from 'uuid';",
      "import plain from 'uuid/v4';",
      'const ids = [named(), named(), plain(), plain()];',
      'const err = (f) => { try { f(); return null; } catch (e) { return String(e && e.message); } };',
      'console.log(JSON.stringify({ ids, named: err(() => named({})), plain: err(() => plain({ random: new Array(16).fill(0) })) }));',
    ].join('\n');
    await bundle({ contents: probe, outfile: out });
    const run = spawnSync(process.execPath, [out], { encoding: 'utf8' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    const r = JSON.parse(run.stdout) as { ids: string[]; named: string | null; plain: string | null };
    expect({ form: r.ids.every((id) => V4.test(id)), distinct: new Set(r.ids).size, named: r.named, plain: r.plain }).toEqual({ form: true, distinct: 4, named: 'snote: uuid v4 takes no arguments', plain: 'snote: uuid v4 takes no arguments' });
  });
});
