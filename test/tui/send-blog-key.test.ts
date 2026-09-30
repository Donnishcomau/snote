/**
 * Send-to-blog key `b` and the help counts it moves (T336).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutHelp } from '../../src/core/help-layout';
import { keymap } from '../../src/core/keymap';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

describe('send to blog key (T336)', () => {
  it('1: WHEN src/core/keymap.ts is read THEN it contains key b, action send_blog, description Send to blog as draft, and keymap.length is 35', () => {
    const source = readFileSync(join(repoRoot, 'src/core/keymap.ts'), 'utf8');
    expect(source).toContain(`key: 'b'`);
    expect(source).toContain(`action: 'send_blog'`);
    expect(source).toContain('Send to blog as draft');
    expect(keymap.length).toBe(35);
  });

  it('2: WHEN layoutHelp(118, 34, "omawrite") is called THEN it returns 29 lines and line 0 is "Help - Keyboard Shortcuts"', () => {
    const lines = layoutHelp(118, 34, 'omawrite');
    expect(lines).toHaveLength(29);
    expect(lines[0]).toBe('Help - Keyboard Shortcuts');
  });

  it('3: WHEN layoutHelp(100, 30, "omawrite") is called THEN it returns 29 lines and some line contains "Send to blog as draft"', () => {
    const lines = layoutHelp(100, 30, 'omawrite');
    expect(lines).toHaveLength(29);
    expect(lines.some((l) => l.includes('Send to blog as draft'))).toBe(true);
  });

  it('4: WHEN src/tui/App.tsx is read THEN split("\\n").length is 247', () => {
    const source = readFileSync(join(repoRoot, 'src/tui/App.tsx'), 'utf8');
    // Physical lines: trimEnd drops the empty element a trailing newline adds.
    expect(source.trimEnd().split('\n').length).toBe(247);
  });
});
