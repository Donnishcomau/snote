// Acceptance tests for T363: the glyph's colour stays a live declarative
// binding. T356 added an imperative restyle() run from
// onNeedsAttentionChanged, but a JS assignment to button.foreground
// REPLACES the declarative binding on the BarIconButton, freezing the
// colour on the first status flip so later theme switches never reach
// the glyph. Color's values are ordinary `property color` declarations
// (qs.Commons Color.qml), so the binding alone re-evaluates on both
// status flips and theme changes. Only the binding must remain.
//
// Style note: no regex lookaheads here (see barwidget-glyph.test.ts);
// plain string contains and split/index counts only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');

const readQml = () => readFileSync(QML, 'utf8');

describe('BarWidget.qml: the foreground colour is a live binding, not an imperative restyle', () => {
  it('1: WHEN BarWidget.qml is read THEN it contains neither `restyle` nor `onNeedsAttentionChanged` nor `button.foreground =`', () => {
    const text = readQml();
    expect(text).not.toContain('restyle');
    expect(text).not.toContain('onNeedsAttentionChanged');
    expect(text).not.toContain('button.foreground =');
  });

  it('2: WHEN BarWidget.qml is read THEN `foreground:` occurs exactly `1` time, its line contains `Color.accent` and `root.bar.barForeground`, and it comes after `id: button`', () => {
    const lines = readQml().split('\n');
    const bindingLines = lines.filter((line) => line.trimStart().startsWith('foreground:'));
    expect(bindingLines).toHaveLength(1);
    expect(bindingLines[0]).toContain('Color.accent');
    expect(bindingLines[0]).toContain('root.bar.barForeground');
    const bindingIndex = lines.findIndex((line) => line.trimStart().startsWith('foreground:'));
    const idIndex = lines.findIndex((line) => line.includes('id: button'));
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(bindingIndex).toBeGreaterThan(idIndex);
  });

  it('3: WHEN BarWidget.qml is read THEN it contains neither `not QML-notifiable` nor `capture the` and still contains `readonly property bool needsAttention`', () => {
    const text = readQml();
    expect(text).not.toContain('not QML-notifiable');
    expect(text).not.toContain('capture the');
    expect(text).toContain('readonly property bool needsAttention');
  });
});
