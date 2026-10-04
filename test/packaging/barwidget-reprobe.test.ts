// Acceptance tests for T346: the bar widget re-checks whether snote is
// installed instead of probing once at start-up. It probes the shim file
// the setup script installs (no dependence on the shell's PATH), re-probes
// on a short repeating timer after a setup click, and on tooltip hover.
// QML cannot run in vitest, so these are structural text tests of
// BarWidget.qml.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');

describe('BarWidget.qml: re-probe after install', () => {
  it('1: WHEN BarWidget.qml is read THEN it contains neither `which snote` nor `"which"`, and the `checkSnoteProc` block holds `"test"`, `"-x"` and `root.snoteShim`, and `snoteShim` is built from `/.local/bin/snote`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).not.toContain('which snote');
    expect(text).not.toContain('"which"');
    const block = text.slice(text.indexOf('id: checkSnoteProc'));
    const procBlock = block.slice(0, block.indexOf('}'));
    expect(procBlock).toContain('"test"');
    expect(procBlock).toContain('"-x"');
    expect(procBlock).toContain('root.snoteShim');
    const shim = text.slice(text.indexOf('snoteShim'));
    expect(shim).toContain('/.local/bin/snote');
  });

  it('2: WHEN BarWidget.qml is read THEN it declares `id: reprobeTimer` with `repeat: true` and `running: root.reprobeLeft > 0`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).toContain('id: reprobeTimer');
    const timer = text.slice(text.indexOf('id: reprobeTimer'));
    const timerBlock = timer.slice(0, timer.indexOf('\n  }'));
    expect(timerBlock).toContain('repeat: true');
    expect(timerBlock).toContain('running: root.reprobeLeft > 0');
  });

  it('3: WHEN the text from `function launchOrHint()` up to the next `Process {` is read THEN it contains `root.reprobeLeft = 15`, and it appears after the second `root.bar.run(`', () => {
    const text = readFileSync(QML, 'utf8');
    const start = text.indexOf('function launchOrHint()');
    const end = text.indexOf('Process {', start);
    const body = text.slice(start, end);
    expect(body).toContain('root.reprobeLeft = 15');
    const firstRun = body.indexOf('root.bar.run(');
    const secondRun = body.indexOf('root.bar.run(', firstRun + 1);
    expect(secondRun).toBeGreaterThan(-1);
    expect(body.indexOf('root.reprobeLeft = 15')).toBeGreaterThan(secondRun);
  });

  it('4: WHEN BarWidget.qml is read THEN `onTooltipHoveredChanged` appears after `id: button` and its line contains `root.reprobe()`', () => {
    const text = readFileSync(QML, 'utf8');
    const buttonAt = text.indexOf('id: button');
    const hoverAt = text.indexOf('onTooltipHoveredChanged');
    expect(hoverAt).toBeGreaterThan(buttonAt);
    const line = text.slice(text.lastIndexOf('\n', hoverAt) + 1, text.indexOf('\n', hoverAt));
    expect(line).toContain('root.reprobe()');
  });

  it('5: WHEN BarWidget.qml is read THEN it contains `function reprobe()`, `function settle()`, `reprobeLeft = 0`, and `root.settle()` at least `2` times, and `Component.onCompleted` is followed by `root.reprobe()`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).toContain('function reprobe()');
    expect(text).toContain('function settle()');
    expect(text).toContain('reprobeLeft = 0');
    expect(text.split('root.settle()').length - 1).toBeGreaterThanOrEqual(2);
    const completedAt = text.indexOf('Component.onCompleted');
    expect(completedAt).toBeGreaterThan(-1);
    expect(text.indexOf('root.reprobe()', completedAt)).toBeGreaterThan(completedAt);
  });
});
