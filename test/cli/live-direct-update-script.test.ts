/**
 * #836 (the #556 AC2 live proof), lane L5d of #30: scripts/live-direct-update.mjs is opt-in and never reaches the network in
 * the suite. Every run here has fetch replaced by a stub that throws (NODE_OPTIONS --import, inherited by the bundled entry),
 * so even a broken opt-in check cannot download anything. The live run itself is the release lane's step on #836.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const NO_NETWORK = "--import=data:text/javascript,globalThis.fetch%3Dasync()%3D%3E%7Bthrow%20new%20Error('no%20network%20in%20tests')%7D";

function runScript(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; out: string; ms: number }> {
  const start = Date.now();
  return new Promise((done) => {
    const { SNOTE_LIVE_UPDATE: _drop, ...rest } = process.env;
    const child = spawn(process.execPath, ['scripts/live-direct-update.mjs', ...args], { env: { ...rest, NODE_OPTIONS: NO_NETWORK, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const kill = setTimeout(() => child.kill('SIGKILL'), 25000);
    child.on('close', (code) => {
      clearTimeout(kill);
      done({ code, out, ms: Date.now() - start });
    });
  });
}

describe('#836 the live direct update harness', () => {
  it('3: WHEN `node scripts/live-direct-update.mjs` runs without SNOTE_LIVE_UPDATE=1 THEN within 2 s it exits 0 and prints only `live-direct-update: skipped (set SNOTE_LIVE_UPDATE=1 to run it against the published GitHub release)`', { timeout: 30000 }, async () => {
    const r = await runScript([]);
    expect([r.code, r.out.trim(), r.ms < 2000]).toEqual([0, 'live-direct-update: skipped (set SNOTE_LIVE_UPDATE=1 to run it against the published GitHub release)', true]);
  });

  it('4: WHEN it runs with `--check` THEN it bundles scripts/live-direct-update-entry.ts, prints `live-direct-update: bundled`, exits 0 and runs no update; the entry passes runningVersion `0.2.11` to downloadVerified as a parameter, flips a tarball byte for run 2, and neither file is shipped in plugin-dist', { timeout: 30000 }, async () => {
    const r = await runScript(['--check']);
    expect([r.code, r.out.trim()]).toEqual([0, 'live-direct-update: bundled']);
    const entry = readFileSync('scripts/live-direct-update-entry.ts', 'utf8');
    expect(entry).toContain("const RUNNING = '0.2.11';");
    expect(entry).toContain('downloadVerified({ ...o, runningVersion: RUNNING, ...(flip ? { fetch: flipping } : {}) })');
    expect(entry).toContain("const two = await run('run2', true);");
    expect(readFileSync('scripts/build-plugin-dist.mjs', 'utf8')).not.toContain('live-direct-update');
  });
});
