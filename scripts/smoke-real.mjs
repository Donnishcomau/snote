// T20 — real-account smoke: create, edit, tag, trash, delete forever, gone.
// Opt-in only: without SNOTE_TEST_EMAIL/SNOTE_TEST_PASSWORD it exits 0
// without touching esbuild or the network. The password is never printed.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const email = process.env.SNOTE_TEST_EMAIL;
const password = process.env.SNOTE_TEST_PASSWORD;

if (!email || !password) {
  console.log(
    'smoke-real: skipped (set SNOTE_TEST_EMAIL and SNOTE_TEST_PASSWORD to run against a real account)'
  );
  process.exit(0);
}

// Environment present: now (and only now) import the bundler.
const { bundle } = await import('./build.mjs');

// One temp dir for the bundle AND the entry's data dir (both live under
// snote-smoke-*, so a crash still leaves exactly one removable folder).
const tmp = mkdtempSync(join(tmpdir(), 'snote-smoke-'));
const outfile = join(tmp, 'bundle.js');

let finished = false;

function finish(code) {
  if (finished) {
    return;
  }
  finished = true;
  rmSync(tmp, { recursive: true, force: true });
  process.exit(code);
}

async function start() {
  try {
    await bundle({ entry: 'scripts/smoke-real-entry.ts', outfile });
  } catch (err) {
    console.log(`error: ${err instanceof Error ? err.message : String(err)}`);
    finish(1);
  }

  // Aggregate the child's output ourselves (instead of stdio: 'inherit')
  // so nothing a bundler or a sync log writes can slip past with the
  // password in it, then re-emit it redacted to our own streams.
  const child = spawn(process.execPath, [outfile, ...process.argv.slice(2)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SNOTE_SMOKE_TMP: tmp },
  });

  const redact = (chunk) =>
    String(chunk).split(password).join('***').split(email).join('***');

  child.stdout.on('data', (chunk) => process.stdout.write(redact(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(redact(chunk)));
  child.on('error', () => finish(1));
  child.on('close', (code) => finish(code ?? 1));
}

void start();
