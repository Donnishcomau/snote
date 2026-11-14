/**
 * Issue #198: neither delivered build ships
 * simperium's http helper (an https.request POST with no timeout whose
 * response is appended to a string with no size limit). snote never calls it;
 * the build answers its require with a stub that rejects.
 * #615: the one request line allowed is snote's own websocket upgrade (SnoteSocket in src/core/websocket-provider.ts):
 * a GET whose non-101 answer is destroyed unread, bounded by the 15 s handshake timer; it must appear exactly once.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { buildPluginDist } from '../../scripts/build-plugin-dist.mjs';

const STUB = 'snote does not ship the simperium http helper';
const BAD = /\b_?https?\.request\b|\.request\)\(|responseData\s*\+=/;
const UPGRADE = 'this.req = tls ? https.request(opts) : http.request(opts);';

function jsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(abs));
    else if (e.name.endsWith('.js')) out.push(abs);
  }
  return out;
}

const scan = (files: string[]) => {
  const text = files.map((f) => readFileSync(f, 'utf8'));
  const lines = text.flatMap((t) => t.split('\n').map((l) => l.trim()));
  return {
    bad: lines.filter((l) => BAD.test(l) && l !== UPGRADE).length,
    upgrade: lines.filter((l) => l === UPGRADE).length,
    stubs: text.filter((t) => t.includes(STUB)).length,
  };
};

describe('issue #198 the delivered JS holds no unbounded request helper', () => {
  let pluginDir: string;
  let distDir: string;

  beforeAll(async () => {
    pluginDir = mkdtempSync(join(tmpdir(), 'no-unbounded-plugin-'));
    distDir = mkdtempSync(join(tmpdir(), 'no-unbounded-dist-'));
    await buildPluginDist(pluginDir);
    await bundle({ entry: 'src/cli/index.ts', outfile: join(distDir, 'snote-main.js') });
  }, 30000);

  afterAll(() => {
    rmSync(pluginDir, { recursive: true, force: true });
    rmSync(distDir, { recursive: true, force: true });
  });

  it('1: WHEN plugin-dist is built THEN no .js line contains `https.request`, `responseData +=` or a `.request)(` call except the websocket upgrade line, which is there exactly once, and the stub `snote does not ship the simperium http helper` is in exactly one file', () => {
    const r = scan(jsFiles(pluginDir));
    expect(r.bad).toBe(0);
    expect(r.upgrade).toBe(1);
    expect(r.stubs).toBe(1);
  });

  it('2: WHEN the single-file dist build is made THEN snote-main.js contains no `https.request`, `responseData +=` or `.request)(` call except the websocket upgrade line once, and holds the stub `snote does not ship the simperium http helper` once', () => {
    const r = scan(jsFiles(distDir));
    expect(r.bad).toBe(0);
    expect(r.upgrade).toBe(1);
    expect(r.stubs).toBe(1);
  });

  it('3: WHEN scripts/*.mjs are scanned THEN every esbuild `plugins:` list that has `simperiumInterop()` also has `simperiumNoHttp()`, and at least `2` lists do', () => {
    const dir = join(process.cwd(), 'scripts');
    const lines = readdirSync(dir)
      .filter((f) => f.endsWith('.mjs'))
      .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n'))
      .filter((l) => /plugins:\s*\[/.test(l) && l.includes('simperiumInterop()'));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l).toContain('simperiumNoHttp()');
  });
});
