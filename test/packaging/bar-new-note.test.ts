// Acceptance tests for T376: middle-click on the bar button asks a
// running snote for a new note, then focuses it. `newNote()` in
// BarWidget.qml now runs one shell line that first tries the shim with
// `--notify-new` (deliver first) and focuses the running window second;
// with no running snote it cold-starts with `--new`, as before. The
// README no longer says the request is dropped and the CHANGELOG gains
// an Unreleased section. QML cannot run in vitest, so these are
// structural text tests over BarWidget.qml, README.md and CHANGELOG.md.
//
// Style note (same as barwidget-glyph.test.ts): no regex lookaheads —
// this machine's node mis-evaluates them — so every check below uses
// plain string contains and indexOf positions only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');
const README = join(process.cwd(), 'README.md');
const CHANGELOG = join(process.cwd(), 'CHANGELOG.md');

// The text of `function newNote()`: from its declaration up to the next
// `function ` or `Process {`, so surrounding comments are excluded.
function newNoteBody(text: string): string {
  const start = text.indexOf('function newNote()');
  expect(start).toBeGreaterThan(-1);
  const body = text.slice(start + 'function newNote()'.length);
  const stops = ['function ', 'Process {']
    .map((marker) => body.indexOf(marker))
    .filter((at) => at > -1);
  expect(stops.length).toBeGreaterThan(0);
  return body.slice(0, Math.min(...stops));
}

// The single line holding `root.bar.run(` inside `newNote()`. Sliced
// from the run( call to the end of that line, so the `&&` of the JS `if
// (root.snoteAvailable && !root.snoteStale)` above is never included.
function runLine(body: string): string {
  const at = body.indexOf('root.bar.run(');
  expect(at).toBeGreaterThan(-1);
  const end = body.indexOf('\n', at);
  return body.slice(at, end === -1 ? body.length : end);
}

describe('T376: middle-click asks a running snote for a new note, then focuses it', () => {
  it('1: WHEN the `newNote()` body of `BarWidget.qml` is read THEN it contains `--notify-new`, then `omarchy-launch-or-focus-tui snote`, then `omarchy-launch-or-focus-tui snote --new`, in that order', () => {
    const body = newNoteBody(readFileSync(QML, 'utf8'));
    const notify = body.indexOf('--notify-new');
    const focus = body.indexOf('omarchy-launch-or-focus-tui snote', notify);
    const cold = body.indexOf('omarchy-launch-or-focus-tui snote --new', focus);
    expect(notify).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(notify);
    expect(cold).toBeGreaterThan(focus);
  });

  it('2: WHEN the line holding `root.bar.run(` inside `newNote()` is read THEN it contains `if \'`, `; then `, `; else ` and `; fi` in order, and contains neither `&&` nor `||`', () => {
    const line = runLine(newNoteBody(readFileSync(QML, 'utf8')));
    const ifAt = line.indexOf("if '");
    const thenAt = line.indexOf('; then ', ifAt);
    const elseAt = line.indexOf('; else ', thenAt);
    const fiAt = line.indexOf('; fi', elseAt);
    expect(ifAt).toBeGreaterThan(-1);
    expect(thenAt).toBeGreaterThan(ifAt);
    expect(elseAt).toBeGreaterThan(thenAt);
    expect(fiAt).toBeGreaterThan(elseAt);
    expect(line).not.toContain('&&');
    expect(line).not.toContain('||');
  });

  it('3: WHEN the `newNote()` body is read THEN it contains `root.shellEscapeSingleQuoted(root.snoteShim)` exactly `1` time and still contains `root.launchOrHint()`', () => {
    const body = newNoteBody(readFileSync(QML, 'utf8'));
    expect(body.split('root.shellEscapeSingleQuoted(root.snoteShim)').length - 1).toBe(1);
    expect(body).toContain('root.launchOrHint()');
  });

  it('4: WHEN `BarWidget.qml` is read THEN it contains neither `only focuses the existing window` nor `argument is dropped`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).not.toContain('only focuses the existing window');
    expect(text).not.toContain('argument is dropped');
  });

  it('5: WHEN `README.md` is read THEN it does not contain `the new-note request is dropped`, contains `--notify-new` and `already running`, and has at most `200` lines', () => {
    const readme = readFileSync(README, 'utf8');
    expect(readme).not.toContain('the new-note request is dropped');
    expect(readme).toContain('--notify-new');
    expect(readme).toContain('already running');
    expect(readme.split('\n').length).toBeLessThanOrEqual(200);
  });

  it('6: WHEN `CHANGELOG.md` is read THEN `## 0.2.4` comes before `## 0.2.3`, and the text between them contains `--notify-new` and `middle-click`', () => {
    const changelog = readFileSync(CHANGELOG, 'utf8');
    const unreleased = changelog.indexOf('## 0.2.4');
    const v023 = changelog.indexOf('## 0.2.3', unreleased);
    expect(unreleased).toBeGreaterThan(-1);
    expect(v023).toBeGreaterThan(unreleased);
    const between = changelog.slice(unreleased, v023);
    expect(between).toContain('--notify-new');
    expect(between).toContain('middle-click');
  });
});
