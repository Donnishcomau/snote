// Acceptance tests for T356: the bar button is a themed Nerd Font glyph,
// not a PNG. The PNG cannot take the bar foreground, so the button now
// draws U+F249 (nf-fa-sticky_note) as `text:` on the BarIconButton and
// colours it from the qs.Commons `Color` singleton: the bar foreground
// normally, Color.accent while snote is missing or out of date. No hex
// literals anywhere; snote-icon.png stays in the repo but is no longer
// loaded from BarWidget.qml.
//
// Style note: no regex lookaheads here. This machine's node (v26.8.1)
// mis-evaluates them (/x(?!a)/.test("xb") is false, verified in a plain
// node -e), so every check below uses plain string contains and
// split counts only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');

// The literal six-character escape `\uf249` as it appears in the .qml
// source (String.raw keeps the backslash out of the test's own string
// escaping).
const GLYPH = String.raw`"\uf249"`;

describe('BarWidget.qml: themed Nerd Font glyph replaces the PNG', () => {
  it('1: WHEN BarWidget.qml is read THEN it contains `import qs.Commons` and `text: "\\uf249"` and contains none of `iconComponent`, `Image {`, `snote-icon.png`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).toContain('import qs.Commons');
    expect(text).toContain(`text: ${GLYPH}`);
    expect(text).not.toContain('iconComponent');
    expect(text).not.toContain('Image {');
    expect(text).not.toContain('snote-icon.png');
  });

  it('2: WHEN the `foreground:` line of BarWidget.qml is read THEN it contains `needsAttention`, `Color.accent`, `root.bar.barForeground` and `Color.foreground`', () => {
    // The BarIconButton's binding, found at the exact binding style so
    // comments merely mentioning the word do not count.
    const bindingLines = readFileSync(QML, 'utf8')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('foreground:'));
    expect(bindingLines).toHaveLength(1);
    const binding = bindingLines[0];
    expect(binding).toContain('needsAttention');
    expect(binding).toContain('Color.accent');
    expect(binding).toContain('root.bar.barForeground');
    expect(binding).toContain('Color.foreground');
  });

  it('3: WHEN BarWidget.qml is read THEN it declares `readonly property bool needsAttention` whose line contains `snoteStatus === "missing"` and `root.snoteStale`', () => {
    const declaration = readFileSync(QML, 'utf8')
      .split('\n')
      .find((line) => line.includes('readonly property bool needsAttention'));
    expect(declaration).toBeDefined();
    expect(declaration).toContain('snoteStatus === "missing"');
    expect(declaration).toContain('root.snoteStale');
  });

  it('4: WHEN BarWidget.qml is read THEN `Color.` occurs at least `3` times and no hex colour (`#` followed by 3 to 8 hex digits) and no `Qt.rgb` occurs', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text.split('Color.').length - 1).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(text).not.toContain('Qt.rgb');
  });
});
