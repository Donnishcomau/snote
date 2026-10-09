// Acceptance tests for T362: a middle click on the bar button starts a
// new note. When snote is installed and current, the middle click runs
// `omarchy-launch-or-focus-tui snote --new`; otherwise it does what a
// left click does (the install path). The README's ## Launcher section
// states the limitation: if snote is already running, the launcher only
// focuses its window and the new-note request is dropped, because snote
// allows one process per data folder. QML cannot run in vitest, so
// these are structural text tests over BarWidget.qml and README.md.
//
// Style note (same as barwidget-glyph.test.ts): no regex lookaheads —
// this machine's node mis-evaluates them — so every check below uses
// plain string contains, indexOf positions and split counts only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');
const README = join(process.cwd(), 'README.md');

// The launcher command with its new-note argument, exactly as it
// appears inside root.bar.run(...) in the .qml.
const NEW_CMD = 'omarchy-launch-or-focus-tui snote --new';

// The two lines of the onPressed handler that mention a mouse button,
// in source order, so position checks stay independent of surrounding
// comments.
function buttonLines(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.includes('Qt.RightButton') || line.includes('Qt.MiddleButton'));
}

describe('BarWidget.qml + README: middle-click starts a new note', () => {
  it('1: WHEN BarWidget.qml is read THEN it contains `omarchy-launch-or-focus-tui snote --new` exactly `1` time and `Qt.MiddleButton` exactly `1` time', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text.split(NEW_CMD).length - 1).toBe(1);
    expect(text.split('Qt.MiddleButton').length - 1).toBe(1);
  });

  it('2: WHEN the `onPressed` handler text is read THEN `Qt.RightButton` comes first, then `Qt.MiddleButton`, then `root.launchOrHint()`', () => {
    const text = readFileSync(QML, 'utf8');
    const lines = buttonLines(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Qt.RightButton');
    expect(lines[1]).toContain('Qt.MiddleButton');
    const right = text.indexOf('Qt.RightButton');
    const middle = text.indexOf('Qt.MiddleButton');
    const launch = text.indexOf('root.launchOrHint()', middle);
    expect(right).toBeGreaterThan(-1);
    expect(middle).toBeGreaterThan(right);
    expect(launch).toBeGreaterThan(middle);
  });

  it('3: WHEN the text of `function newNote()` (up to the next `function ` or `Process {`) is read THEN it contains `root.snoteAvailable`, `!root.snoteStale`, `snote --new` and `root.launchOrHint()`', () => {
    const text = readFileSync(QML, 'utf8');
    const start = text.indexOf('function newNote()');
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start + 'function newNote()'.length);
    const stops = ['function ', 'Process {']
      .map((marker) => body.indexOf(marker))
      .filter((at) => at > -1);
    expect(stops.length).toBeGreaterThan(0);
    const slice = body.slice(0, Math.min(...stops));
    expect(slice).toContain('root.snoteAvailable');
    expect(slice).toContain('!root.snoteStale');
    expect(slice).toContain('snote --new');
    expect(slice).toContain('root.launchOrHint()');
  });

  it('4: WHEN README.md is read THEN its `## Launcher` section contains `Middle-click`, `snote --new`, `already running` and `--notify-new`', () => {
    const readme = readFileSync(README, 'utf8');
    const start = readme.indexOf('## Launcher');
    expect(start).toBeGreaterThan(-1);
    const nextHeading = readme.indexOf('## ', start + 4);
    const end = nextHeading === -1 ? readme.length : nextHeading;
    const section = readme.slice(start, end);
    expect(section).toContain('Middle-click');
    expect(section).toContain('snote --new');
    expect(section).toContain('already running');
    expect(section).toContain('--notify-new');
    expect(section).not.toContain('only focuses its window');
  });
});
