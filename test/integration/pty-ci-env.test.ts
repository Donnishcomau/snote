/**
 * #317: Ink 7 treats a process with CI (or CONTINUOUS_INTEGRATION) in its environment as non-interactive and writes
 * no frame until it exits, so a user whose shell sets CI=true saw a blank screen. snote passes `interactive` from
 * stdout's TTY flag, so on a terminal it draws as usual whatever CI says. The proof starts the BUILT bundle on a real
 * pseudo-terminal with CI=true (test/helpers/pty-ci-drive.py) and requires the note on screen before any key is sent.
 * The bundle is dist/snote-main.js when SNOTE_PTY_BUNDLE names it (CI), else a fresh bundle of src/.
 * Linux only (python3 pty). SNOTE_PTY_REQUIRED=1 (CI) turns a missing pty into a failure, never a skip.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { accountDir } from '../../src/core/token';

const MARK = 'CIMARK317';
const python = spawnSync('python3', ['-I', '-c', 'import pty'], { stdio: 'ignore' }).status === 0;
const enabled = process.platform === 'linux' && python;
const required = process.env.SNOTE_PTY_REQUIRED === '1';
const root = mkdtempSync(join(tmpdir(), 'pty-ci-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Start the bundle on a pty with CI=true and one note holding MARK; the driver's exit and every byte shown. */
function drive(bundlePath: string, name: string, waitSeconds: number): { status: number | null; wire: string } {
  const data = join(root, name, 'data');
  const home = join(root, name, 'home');
  mkdirSync(home, { recursive: true });
  const dir = accountDir(data, 'a@b.co');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(data, 'auth.json'), JSON.stringify({ email: 'a@b.co', token: 't', server: 'http://127.0.0.1:9' }), { mode: 0o600 });
  const store = makeStore({ stubClient: {} });
  const note = { content: `${MARK}\nsecond line`, tags: [], systemTags: [], deleted: false, creationDate: 1000, modificationDate: 1000 };
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'c1' as never, note: note as never });
  saveState(store.getState(), dir);
  const out = join(root, name, 'wire.bin');
  const driver = join(process.cwd(), 'test/helpers/pty-ci-drive.py');
  const r = spawnSync('python3', ['-I', driver, process.execPath, bundlePath, data, home, out, MARK, String(waitSeconds)], { encoding: 'utf8', timeout: 90000 });
  let wire = '';
  try {
    wire = readFileSync(out).toString('latin1');
  } catch {
    // no capture file
  }
  return { status: r.status, wire };
}

describe.skipIf(!enabled && !required)('#317 snote draws on a terminal when CI=true is set', () => {
  let bundlePath = '';
  beforeAll(async () => {
    if (!enabled) throw new Error('SNOTE_PTY_REQUIRED=1 but this machine has no pty (Linux with python3 pty)');
    if (process.env.SNOTE_PTY_BUNDLE) bundlePath = resolve(process.env.SNOTE_PTY_BUNDLE);
    else {
      bundlePath = join(root, 'snote.js');
      await bundle({ entry: 'src/cli/index.ts', outfile: bundlePath });
    }
  }, 120000);

  it('1: WHEN the built bundle starts on a pty with `CI=true` and `CONTINUOUS_INTEGRATION=true` THEN the note list with `CIMARK317` is drawn before any key is sent (driver exit `0`) and the pane title is styled (`\\x1b[34mNotes`)', () => {
    const r = drive(bundlePath, 'ci', 45);
    expect(r.status).toBe(0);
    expect(r.wire).toContain(MARK);
    expect(r.wire).toContain('\x1b[34mNotes');
  }, 90000);

  it('2: WHEN the bundle path does not exist THEN the driver exits `3` and no marker is captured (the driver cannot pass on an empty run)', () => {
    const r = drive(join(root, 'no-such-bundle.js'), 'missing', 2);
    expect(r.status).toBe(3);
    expect(r.wire).not.toContain(MARK);
  }, 30000);
});

describe('#317 the entry keeps CI when stdout is not a terminal', () => {
  it('3: WHEN src/cli/terminal-env.ts loads with `CI=true` and `CONTINUOUS_INTEGRATION=true` and stdout is not a TTY (a pipe, this test) THEN both stay set', async () => {
    const saved = { ci: process.env.CI, cont: process.env.CONTINUOUS_INTEGRATION };
    process.env.CI = 'true';
    process.env.CONTINUOUS_INTEGRATION = 'true';
    try {
      expect(process.stdout.isTTY === true).toBe(false);
      await import('../../src/cli/terminal-env');
      expect(process.env.CI).toBe('true');
      expect(process.env.CONTINUOUS_INTEGRATION).toBe('true');
    } finally {
      if (saved.ci === undefined) delete process.env.CI;
      else process.env.CI = saved.ci;
      if (saved.cont === undefined) delete process.env.CONTINUOUS_INTEGRATION;
      else process.env.CONTINUOUS_INTEGRATION = saved.cont;
    }
  });
});
