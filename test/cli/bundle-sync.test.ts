/**
 * T162: the bundled app can sync — prove the BUNDLED sync code runs against
 * the fake server (the unit tests could not catch the CJS/ESM interop bug
 * because vitest resolves `simperium` differently from the bundle).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { FakeSimperiumServer } from '../fake-simperium/server';

const ENTRY = 'test/fixtures/bundle-sync-entry.ts';

let outfile: string;
let server: FakeSimperiumServer;
let serverUrl: string;
let dataDir: string;
const dirs: string[] = [];

function runBundle(url: string, dir: string): Promise<{ status: number | null; out: string; err: string }> {
  // spawnSync would BLOCK this vitest process — and the fake server runs
  // inside it — so the child could never be answered. Use async spawn.
  return new Promise((res) => {
    const p = spawn('node', [outfile, url, dir]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (status) => res({ status, out, err }));
  });
}

describe('T162 bundled sync', () => {
  beforeAll(async () => {
    outfile = join(mkdtempSync(join(tmpdir(), 'bundle-sync-')), 'entry.js');
    server = new FakeSimperiumServer();
    ({ url: serverUrl } = await server.start());
    server.seedBucket('test-app', 'note', [
      {
        id: 'b1',
        data: {
          content: 'Content 1',
          creationDate: Date.now(),
          deleted: 0,
          modificationDate: Date.now(),
          systemTags: [],
          tags: [],
        },
        version: 1,
      },
      {
        id: 'b2',
        data: {
          content: 'Content 2',
          creationDate: Date.now(),
          deleted: 0,
          modificationDate: Date.now(),
          systemTags: [],
          tags: [],
        },
        version: 1,
      },
    ]);
    await bundle({ entry: ENTRY, outfile });
  }, 20000);

  afterAll(() => {
    server.stop();
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (outfile) rmSync(outfile, { force: true });
  });

  it('1: WHEN the entry file is bundled with bundle({ entry: "test/fixtures/bundle-sync-entry.ts", outfile }) and run against the fake server THEN the exit status is 0 and stdout contains notes=2', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bundle-sync-data-'));
    dirs.push(dataDir);
    const result = await runBundle(serverUrl, dataDir);
    expect(result.status).toBe(0);
    expect(result.out).toContain('notes=2');
  }, 12000);

  it('2: WHEN the same run has finished THEN stderr does not contain "is not a function", and the data dir contains the file ghosts-note.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-sync-data-'));
    dirs.push(dir);
    const result = await runBundle(serverUrl, dir);
    expect(result.err).not.toContain('is not a function');
    expect(existsSync(join(dir, 'ghosts-note.json'))).toBe(true);
  }, 12000);

  it('3: WHEN the bundled text is read THEN it contains simperium_default( and does not contain import_simperium.default)(', () => {
    const bundled = readFileSync(outfile, 'utf8');
    expect(bundled).toContain('simperium_default(');
    expect(bundled).not.toContain('import_simperium.default)(');
  });

  it('4: WHEN scripts/build.mjs is read THEN it contains simperiumInterop and the namespace simperium-interop', () => {
    const script = readFileSync('scripts/build.mjs', 'utf8');
    expect(script).toContain('simperiumInterop');
    expect(script).toContain('simperium-interop');
  });

  it('5: WHEN the bundled file is run with an unreachable server url ws://127.0.0.1:9 THEN within 8 s it exits with status 1 and stdout contains error:', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-sync-data-'));
    dirs.push(dir);
    const result = await runBundle('ws://127.0.0.1:9', dir);
    expect(result.status).toBe(1);
    expect(result.out).toContain('error:');
  }, 12000);
});
