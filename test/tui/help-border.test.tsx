/**
 * Help overlay: square borders via single-line box chars (T245).
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import * as fs from 'fs';
import * as path from 'path';

describe('Help border style', () => {
  it('1: WHEN src/tui/Help.tsx is read as text THEN it contains borderStyle="single" exactly 1 time and borderStyle="round" 0 times', () => {
    const helpPath = path.join(__dirname, '../../src/tui/Help.tsx');
    const content = fs.readFileSync(helpPath, 'utf-8');
    const singleMatches = (content.match(/borderStyle="single"/g) || []).length;
    const roundMatches = (content.match(/borderStyle="round"/g) || []).length;
    expect(singleMatches).toBe(1);
    expect(roundMatches).toBe(0);
  });

  it('2: WHEN every file matching src/tui/*.tsx is read as text THEN together they contain borderStyle= exactly 1 time', () => {
    const tuiDir = path.join(__dirname, '../../src/tui');
    const files = fs.readdirSync(tuiDir).filter((f) => f.endsWith('.tsx'));
    let totalBorderStyle = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(tuiDir, file), 'utf-8');
      const matches = content.match(/borderStyle=/g) || [];
      totalBorderStyle += matches.length;
    }
    expect(totalBorderStyle).toBe(1);
  });

  it('3: WHEN <Help width={80} height={24} /> is rendered THEN lastFrame() contains ┌ and └ and does not contain ╭ or ╰', async () => {
    const { frames, unmount } = render(<Help width={80} height={24} />);
    await new Promise((r) => setTimeout(r, 50));
    const frame = frames[frames.length - 1] || '';
    const plain = frame.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('┌');
    expect(plain).toContain('└');
    expect(plain).not.toContain('╭');
    expect(plain).not.toContain('╰');
    unmount();
  });

  it('4: WHEN <Help width={120} height={40} /> is rendered THEN lastFrame() contains ┐ and ┘ and does not contain ╮ or ╯', async () => {
    const { frames, unmount } = render(<Help width={120} height={40} />);
    await new Promise((r) => setTimeout(r, 50));
    const frame = frames[frames.length - 1] || '';
    const plain = frame.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('┐');
    expect(plain).toContain('┘');
    expect(plain).not.toContain('╮');
    expect(plain).not.toContain('╯');
    unmount();
  });
});
