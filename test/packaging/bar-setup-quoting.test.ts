// Acceptance tests for T418 (security fix, F091/S4-09): the bar's
// first-click setup command quotes the setup path for BOTH shells it
// passes through — `bash -lc` (bar.run) and the launcher's own
// `cmd="$*"` + `bash -c`. QML cannot run in vitest, so `setupCommand`
// (and its helper `q`) are sliced out of BarWidget.qml between their
// marker comments and evaluated as plain JavaScript, exactly like
// test/packaging/barwidget-tooltip.test.ts does for the formatters.
// The two shells are replayed for real: the test writes its own
// stand-in launcher with the launcher's two key lines into a temp bin
// dir put first on PATH, plus a fake omarchy-launch-or-focus-tui, then
// runs the command with `bash -lc`.
//
// Note on path shapes: the real Qt.resolvedUrl-based setupScript would
// URL-encode characters like a single quote (%27), but that encoding
// never covers spaces, `$(...)`, backticks or quotes as literal
// characters for the two shells below, so the drive-by payload uses the
// dangerous characters unencoded — the hardest case the quoting has to
// survive.
//
// Note on the launcher stub: the launcher's real pipeline is
// `cmd="$*"` then `bash -c "$presentation_script"`, and the accepted
// payload (F091's proven form) ends with a bare `exit`. The stand-in
// here keeps the two key lines of that pipeline, and nothing else: no
// terminal, no logo binary.
//
// Note on the bash login shell: bar.run really runs `bash -lc`, and this
// machine's bash login profile needs a real `env` on PATH, so the
// harness keeps the inherited PATH and only puts its stand-ins in front.
//
// Both tests that replay the shells are also the check that today's
// code fails them: until BarWidget.qml has `setupCommand` between the
// markers, the slice throws (`setupCommand is not defined`) and no
// command reaches `bash -lc` at all.
import { describe, it, expect } from 'vitest';
import {
  existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync,
  readFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');
const BEGIN = '// setup-command:begin';
const END = '// setup-command:end';
const REAL_LAUNCHER = 'omarchy-launch-floating-terminal-with-presentation';

function readQml(): string {
  return readFileSync(QML, 'utf8');
}

// Slice the plain JavaScript between the two marker comments and
// evaluate it: the functions there use no `root.`, `Qt.` or QML names,
// so `new Function` can hand them back for direct calls.
function setupCommandOf(path: string): string {
  const text = readQml();
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const slice = text.slice(begin + BEGIN.length, end);
  const { setupCommand } = new Function(
    slice + '\nreturn { setupCommand };'
  )() as { setupCommand: (p: string) => string };
  return setupCommand(path);
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

interface Harness {
  root: string;
  mark: string;
  // Write an executable stub setup script at `path` that prints
  // SETUP-RAN; if the payload's `$(touch MARK)` ever reaches a shell
  // as a command, MARK appears in the harness root.
  writeSetupStub: (path: string) => void;
  // Run `command` the way bar.run does: `bash -lc`, stand-ins first on PATH.
  run: (command: string) => Run;
}

// A temp root holding bin/ with the stand-in launcher (built from the
// real one's key lines), a fake tui launcher, and a MARK path that must
// never come into existence.
function makeHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'bar-setup-quoting-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  // The stand-in under test: the launcher's two key lines, under the
  // real launcher's exact name so it is picked up from PATH.
  const realLauncher = join(bin, REAL_LAUNCHER);
  writeFileSync(
    realLauncher,
    '#!/bin/bash\ncmd="$*"\n' +
      'presentation_script="omarchy-show-logo; $cmd; exit"\n' +
      'bash -c "$presentation_script"\n'
  );
  chmodSync(realLauncher, 0o755);
  // Stands in for omarchy-show-logo: the real launcher runs it inside
  // the same `bash -c`.
  writeFileSync(join(bin, 'omarchy-show-logo'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'omarchy-show-logo'), 0o755);
  writeFileSync(join(bin, 'omarchy-launch-or-focus-tui'), '#!/bin/sh\necho "LAUNCHED $*"\n');
  chmodSync(join(bin, 'omarchy-launch-or-focus-tui'), 0o755);
  const mark = join(root, 'MARK');

  const bashLc = (command: string): Run => {
    try {
      const stdout = execFileSync('/usr/bin/bash', ['-lc', command], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 2000,
      });
      return { status: 0, stdout, stderr: '' };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return {
        status: err.status ?? -1,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
      };
    }
  };

  // Write an executable stub setup script at `path` that prints
  // SETUP-RAN. Its `$(touch MARK)` lives only in the *name* of a path
  // component (like the drive-by temp dir in Acceptance 1), so MARK
  // can only ever be created if one of the shells breaks the quoting
  // and lets the payload run as a command.
  const writeSetupStub = (path: string): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, '#!/bin/sh\necho SETUP-RAN\n');
    chmodSync(path, 0o755);
  };

  return { root, mark, writeSetupStub, run: bashLc };
}

function cleanup(h: Harness): void {
  rmSync(h.root, { recursive: true, force: true });
}

describe('BarWidget.qml: the setup command is quoted for both shells', () => {
  it("1: WHEN setupCommand gets the path of an executable stub setup script, printing `SETUP-RAN`, in a temp dir named `d it's $(touch MARK) x`, and its result runs with `bash -lc` and the stand-in launcher on PATH THEN stdout contains `SETUP-RAN` then `LAUNCHED snote`, and no file `MARK` was created", () => {
    const h = makeHarness();
    try {
      const dirName = "d it's $(touch MARK) x";
      const setupPath = join(h.root, dirName, 'packaging', 'omarchy', 'setup');
      h.writeSetupStub(setupPath);
      const result = h.run(setupCommandOf(setupPath));
      const ran = result.stdout.indexOf('SETUP-RAN');
      const launched = result.stdout.indexOf('LAUNCHED snote');
      expect(ran).toBeGreaterThanOrEqual(0);
      expect(launched).toBeGreaterThan(ran);
      expect(existsSync(h.mark)).toBe(false);
    } finally {
      cleanup(h);
    }
  });

  it('2: WHEN it gets `/home/u/.config/omarchy/plugins/io.github.donnishcomau.snote-simplenote/packaging/omarchy/setup` THEN the result starts with `omarchy-launch-floating-terminal-with-presentation ` and, run the same way with a stub at that path under a temp root, prints `SETUP-RAN` then `LAUNCHED snote`', () => {
    const h = makeHarness();
    try {
      const absPath =
        '/home/u/.config/omarchy/plugins/io.github.donnishcomau.snote-simplenote/packaging/omarchy/setup';
      const command = setupCommandOf(absPath);
      expect(command.startsWith('omarchy-launch-floating-terminal-with-presentation ')).toBe(true);
      // Run the same command the same way (bash -lc, the stand-in
      // launcher's two shells), with a stub setup script placed at a
      // copy of this very path inside the temp root — the only form
      // writable without root, and the shells see the same command
      // either way.
      const stubPath = join(h.root, absPath);
      h.writeSetupStub(stubPath);
      const result = h.run(command.replace(absPath, stubPath));
      const ran = result.stdout.indexOf('SETUP-RAN');
      const launched = result.stdout.indexOf('LAUNCHED snote');
      expect(ran).toBeGreaterThanOrEqual(0);
      expect(launched).toBeGreaterThan(ran);
    } finally {
      cleanup(h);
    }
  });

  it('3: WHEN BarWidget.qml is read THEN `launchOrHint()` contains `root.setupCommand(root.setupScript)`, and the file does not contain `in practice it never contains a single quote`', () => {
    const text = readQml();
    const launch = text.slice(text.indexOf('function launchOrHint()'));
    const body = launch.slice(0, launch.indexOf('\n\n'));
    expect(body).toContain('root.setupCommand(root.setupScript)');
    expect(text).not.toContain('in practice it never contains a single quote');
  });
});
