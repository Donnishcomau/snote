/**
 * T506: the bundled crash entry that throws a message holding note-like
 * text leaves a crash file with only the redacted message. Same rig as
 * test/cli/crash-handler.test.ts (async `spawn`, never spawnSync).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';

const ENTRY = 'test/fixtures/crash-entry-secret.ts';

let outfile: string;
let outDir: string;

function runCrash(
  stateDir: string,
): Promise<{ status: number | null; combined: string }> {
  return new Promise((res) => {
    const p = spawn('node', [outfile, stateDir], {
      env: { ...process.env, XDG_STATE_HOME: stateDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let combined = '';
    p.stdout.on('data', (d) => (combined += d));
    p.stderr.on('data', (d) => (combined += d));
    p.on('close', (status) => res({ status, combined }));
  });
}

// Poll until a crash file whose error.message is `<w> <w> <w>` exists (the
// piped-stdin raw-mode error may write a second, different file).
async function waitForCrashText(dir: string, timeoutMs: number): Promise<string> {
  const snote = join(dir, 'snote');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let files: string[] = [];
    try {
      files = readdirSync(snote).filter((f) => f.startsWith('crash-'));
    } catch {
      // state dir not created (yet)
    }
    for (const f of files) {
      const text = readFileSync(join(snote, f), 'utf8');
      try {
        const r = JSON.parse(text) as { error?: { message?: string } };
        if (r.error?.message === '<w> <w> <w>') return text;
      } catch {
        // file still being written
      }
    }
    if (Date.now() >= deadline) return '';
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('T506 crash bundle redaction', () => {
  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'crash-redact-'));
    outfile = join(outDir, 'entry.js');
    await bundle({ entry: ENTRY, outfile });
  }, 20000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('5: WHEN the bundled `crash-entry-secret.ts` is run THEN the exit status is `1`, the `crash-*.json` `error.message` is `<w> <w> <w>`, and the file text contains neither `CONTENTMARK` nor `hunter2`', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'crash-state-'));
    const result = await runCrash(stateDir);
    expect(result.status).toBe(1);
    const text = await waitForCrashText(stateDir, 10000);
    expect(text).not.toBe('');
    const record = JSON.parse(text) as { error: { message: string } };
    expect(record.error.message).toBe('<w> <w> <w>');
    expect(text).not.toContain('CONTENTMARK');
    expect(text).not.toContain('hunter2');
    rmSync(stateDir, { recursive: true, force: true });
  }, 12000);
});
