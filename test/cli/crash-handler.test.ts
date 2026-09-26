/**
 * T214: the app never dumps a stack trace — a thrown error anywhere leaves
 * the terminal usable: the app unmounts, writes the crash record to a state
 * file, prints three calm lines and exits with status 1.
 *
 * Runs the BUNDLED crash entry as a child process with the async `spawn`
 * pattern from test/cli/bundle-sync.test.ts (never spawnSync).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { resetKeyLog } from '../../src/tui/app-keys';

const ENTRY = 'test/fixtures/crash-entry.ts';
// T232 — a second entry that seeds notes/tags/keys before it crashes.
const ENTRY_SESSION = 'test/fixtures/crash-entry-session.ts';

// React's own render internals appear in every render-error stack
// (`performUnitOfWork`, `workLoopSync`, …). They must never be mistaken for
// a redacted-away session value like the `work` tag in the whole-file check.
function scrubReactInternals(text: string): string {
  return text
    .replaceAll('performUnitOfWork', 'FRAME_A')
    .replaceAll('workLoopSync', 'FRAME_B');
}

let outfile: string;
let sessionOutfile: string;
let outDir: string;

// Run a bundled entry, capturing BOTH streams into one combined output,
// as a user's terminal would show them. `args` are entry argv (the fixture
// takes the state dir as process.argv[2] and forwards it to main() as
// --data-dir); `env` selects XDG_STATE_HOME.
// Never kill the child: killing would skip the handler's process.exit,
// so we rely on the 12 s test timeout to catch a hung run instead.
function runCrash(
  args: string[],
  env: Record<string, string>,
  entry = outfile,
): Promise<{ status: number | null; combined: string }> {
  return new Promise((res) => {
    const p = spawn('node', [entry, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let combined = '';
    p.stdout.on('data', (d) => (combined += d));
    p.stderr.on('data', (d) => (combined += d));
    p.on('close', (status) => res({ status, combined }));
  });
}

// The crash file lands under <XDG_STATE_HOME>/snote. The Boom render error
// reaches the handler before any secondary effect error (a piped-stdin raw
// mode throw), so poll until the recorded error.message is `kaboom`.
async function waitForCrashFile(
  dir: string,
  timeoutMs: number,
): Promise<string> {
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
      try {
        const r = JSON.parse(
          readFileSync(join(snote, f), 'utf8'),
        ) as { error?: { message?: string } };
        if (r.error?.message === 'kaboom') return f;
      } catch {
        // file still being written
      }
    }
    if (Date.now() >= deadline) return files[0] ?? '';
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Poll until the crash file exists with a `session` field (T232); the Boom
// render error reaches the handler before any secondary effect error (a
// piped-stdin raw mode throw). Returns the first crash file once it parses
// and carries `session`, else the first crash file at the deadline.
async function waitForSessionFile(dir: string, timeoutMs: number): Promise<string> {
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
      try {
        const r = JSON.parse(
          readFileSync(join(snote, f), 'utf8'),
        ) as { session?: unknown };
        if (r.session !== undefined) return f;
      } catch {
        // file still being written
      }
    }
    if (Date.now() >= deadline) return files[0] ?? '';
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Run the session entry once and read the session object it wrote.
async function runSessionAndRead(
  stateDir: string,
): Promise<Record<string, unknown>> {
  const result = await runCrash([stateDir], { XDG_STATE_HOME: stateDir }, sessionOutfile);
  expect(result.status).toBe(1);
  const file = await waitForSessionFile(stateDir, 10000);
  expect(file).not.toBe('');
  const parsed = JSON.parse(
    readFileSync(join(stateDir, 'snote', file), 'utf8'),
  ) as Record<string, unknown>;
  return parsed;
}

describe('T214 crash handler', () => {
  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'crash-handler-'));
    outfile = join(outDir, 'entry.js');
    sessionOutfile = join(outDir, 'entry-session.js');
    await bundle({ entry: ENTRY, outfile });
  }, 20000);

  // T232 — bundle the session entry exactly once, and keep the module-scope
  // key log of THIS process empty: the fixture seeds its own keys in the
  // CHILD, while main() snapshots the key log of whoever calls it.
  beforeAll(async () => {
    await bundle({ entry: ENTRY_SESSION, outfile: sessionOutfile });
  }, 20000);

  beforeEach(() => {
    resetKeyLog();
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("1: WHEN the bundled entry is run THEN its exit status is `1` and its combined output contains `snote hit a bug and stopped.`", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'crash-state-'));
    const result = await runCrash([stateDir], { XDG_STATE_HOME: stateDir });
    expect(result.status).toBe(1);
    expect(result.combined).toContain('snote hit a bug and stopped.');
    rmSync(stateDir, { recursive: true, force: true });
  }, 12000);

  it('2: WHEN the same run has finished THEN exactly `1` file matching `crash-` exists in the state dir and its parsed JSON has `error.message` equal to `kaboom`', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'crash-state-'));
    const result = await runCrash([stateDir], { XDG_STATE_HOME: stateDir });
    expect(result.status).toBe(1);
    const file = await waitForCrashFile(stateDir, 10000);
    const crashFiles = readdirSync(join(stateDir, 'snote')).filter((f) =>
      f.startsWith('crash-'),
    );
    expect(crashFiles).toHaveLength(1);
    const record = JSON.parse(
      readFileSync(join(stateDir, 'snote', file), 'utf8'),
    ) as { error: { message: string } };
    expect(record.error.message).toBe('kaboom');
    rmSync(stateDir, { recursive: true, force: true });
  }, 12000);

  it("3: WHEN the same run has finished THEN the output contains the path of that file and does not contain `at Object.` or `node:internal`", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'crash-state-'));
    const result = await runCrash([stateDir], { XDG_STATE_HOME: stateDir });
    const file = await waitForCrashFile(stateDir, 10000);
    expect(file).not.toBe('');
    const crashPath = join(stateDir, 'snote', file);
    expect(result.combined).toContain(crashPath);
    expect(result.combined).not.toContain('at Object.');
    expect(result.combined).not.toContain('node:internal');
    rmSync(stateDir, { recursive: true, force: true });
  }, 12000);

  it("4: WHEN the entry is run with a state dir that cannot be created (a path whose parent is a file) THEN the exit status is still `1`, the output contains `could not be saved` and contains `snote hit a bug and stopped.`", async () => {
    const blockDir = mkdtempSync(join(tmpdir(), 'crash-block-'));
    const blockFile = join(blockDir, 'blocker');
    writeFileSync(blockFile, 'not a directory');
    const stateDir = join(blockFile, 'nested', 'state');
    const result = await runCrash([stateDir], { XDG_STATE_HOME: stateDir });
    expect(result.status).toBe(1);
    expect(result.combined).toContain('could not be saved');
    expect(result.combined).toContain('snote hit a bug and stopped.');
    rmSync(blockDir, { recursive: true, force: true });
  }, 12000);

  it("5: WHEN `src/cli/main.tsx` is read THEN it contains `uncaughtException`, `unhandledRejection` and `crashReport`", () => {
    const source = readFileSync('src/cli/main.tsx', 'utf8');
    expect(source).toContain('uncaughtException');
    expect(source).toContain('unhandledRejection');
    expect(source).toContain('crashReport');
  });

  // T232 — the crash bundle is a replayable recipe: a redacted `session`
  // snapshot of the notes/tags/keys that existed at the moment of the crash.
  let parsed: Record<string, unknown> = {};

  it('6: WHEN the bundled `crash-entry-session.ts` entry is run and crashes THEN the written `crash-*.json`\'s `session.noteCount` is `2` and `session.noteLengths` is `[5, 8]`', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'crash-session-'));
    parsed = await runSessionAndRead(stateDir);
    const session = parsed.session as {
      noteCount: number;
      noteLengths: number[];
    };
    expect(session.noteCount).toBe(2);
    expect(session.noteLengths).toEqual([5, 8]);
    rmSync(stateDir, { recursive: true, force: true });
  }, 12000);

  it("7: WHEN the same run's file is read THEN `session.tagCount` is `1` and `session.keys` has length `2` with `session.keys[1].input` equal to `k`", async () => {
    const session = parsed.session as {
      tagCount: number;
      keys: { input: string }[];
    };
    expect(session.tagCount).toBe(1);
    expect(session.keys).toHaveLength(2);
    expect(session.keys[1].input).toBe('k');
  }, 12000);

  it('8: WHEN the same file is read THEN `JSON.stringify(parsed)` does not contain `Hello`, `Hi there` or `work`', () => {
    // scrubReactInternals only rewrites React's own stack frames (fixed
    // strings), so any surviving `Hello`/`Hi there`/`work` is real content.
    const text = scrubReactInternals(JSON.stringify(parsed));
    expect(text).not.toContain('Hello');
    expect(text).not.toContain('Hi there');
    expect(text).not.toContain('work');
  });

  it("9: WHEN the ORIGINAL `crash-entry.ts` (T214's, no notes/keys seeded) is run and crashes THEN its file's `session.noteCount` is `0` and `session.keys` is `[]`", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'crash-state-'));
    const result = await runCrash([stateDir], { XDG_STATE_HOME: stateDir });
    expect(result.status).toBe(1);
    const file = await waitForSessionFile(stateDir, 10000);
    expect(file).not.toBe('');
    const record = JSON.parse(
      readFileSync(join(stateDir, 'snote', file), 'utf8'),
    ) as { session: { noteCount: number; keys: unknown[] } };
    expect(record.session.noteCount).toBe(0);
    expect(record.session.keys).toEqual([]);
    rmSync(stateDir, { recursive: true, force: true });
  }, 12000);
});
