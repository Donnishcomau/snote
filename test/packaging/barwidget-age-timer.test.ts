// Acceptance tests for T370: the bar tooltip's "Synced X ago" keeps
// updating while the tooltip stays open. A slow repeating Timer refreshes
// root.nowMs while the button's tooltip is hovered. QML cannot run in
// vitest, so these are structural text tests of BarWidget.qml.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');

describe('BarWidget.qml: age timer refreshes nowMs while hovered', () => {
  it('1: WHEN the block from `id: ageTimer` to its closing brace is read THEN it contains `interval: 30000`, `repeat: true`, `running: button.tooltipHovered` and `root.nowMs = Date.now()`', () => {
    const text = readFileSync(QML, 'utf8');
    const block = text.slice(text.indexOf('id: ageTimer'));
    const timerBlock = block.slice(0, block.indexOf('\n  }'));
    expect(timerBlock).toContain('interval: 30000');
    expect(timerBlock).toContain('repeat: true');
    expect(timerBlock).toContain('running: button.tooltipHovered');
    expect(timerBlock).toContain('root.nowMs = Date.now()');
  });

  it('2: WHEN BarWidget.qml is read THEN `id: ageTimer` occurs exactly `1` time, after `id: reprobeTimer`, and `Timer {` occurs exactly `2` times', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text.split('id: ageTimer').length - 1).toBe(1);
    expect(text.indexOf('id: ageTimer')).toBeGreaterThan(text.indexOf('id: reprobeTimer'));
    expect(text.split('Timer {').length - 1).toBe(2);
  });
});
