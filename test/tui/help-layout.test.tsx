import React from 'react';
import { render } from 'ink-testing-library';
import { layoutHelp } from '../../src/core/help-layout';
import { Help } from '../../src/tui/Help';

const frameLines = (el: React.ReactElement): string[] => {
  const { lastFrame } = render(el);
  return (lastFrame() ?? '').split('\n');
};

describe('help layout', () => {
  it('1: WHEN layoutHelp(118, 34, "omawrite") and layoutHelp(312, 81, "omawrite") are called THEN each returns 30 lines, line 0 of each equals "Help - Keyboard Shortcuts", every line of the first is <= 118 long and every line of the second is <= 312 long', () => {
    // T315.2: keymap grew from 35 to 36 (edit_note_inline), adding 1 row.
    const a = layoutHelp(118, 34, 'omawrite');
    const b = layoutHelp(312, 81, 'omawrite');
    expect(a).toHaveLength(30);
    expect(b).toHaveLength(30);
    expect(a[0]).toBe('Help - Keyboard Shortcuts');
    expect(b[0]).toBe('Help - Keyboard Shortcuts');
    for (const line of a) expect(line.length).toBeLessThanOrEqual(118);
    for (const line of b) expect(line.length).toBeLessThanOrEqual(312);
  });

  it('2: WHEN layoutHelp(118, 34, "omawrite") is called THEN some line contains "v         Toggle rendered markdown preview" and some line contains "u         Restore from trash (trash view)"', () => {
    const lines = layoutHelp(118, 34, 'omawrite');
    expect(lines.some((l) => l.includes('v         Toggle rendered markdown preview'))).toBe(true);
    expect(lines.some((l) => l.includes('u         Restore from trash (trash view)'))).toBe(true);
  });

  it('3: WHEN layoutHelp(118, 34, "omawrite") is called THEN exactly one line starts with "Tags" and that line does not contain "(note)"', () => {
    const lines = layoutHelp(118, 34, 'omawrite');
    const tagLines = lines.filter((l) => l.startsWith('Tags'));
    expect(tagLines).toHaveLength(1);
    expect(tagLines[0].includes('(note)')).toBe(false);
  });

  it('4: WHEN layoutHelp(100, 30, "omawrite") is called THEN it returns 30 lines, every line\'s length is <= 100, and some line contains "t         Show / focus the tags pane"', () => {
    const lines = layoutHelp(100, 30, 'omawrite');
    expect(lines).toHaveLength(30);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(100);
    expect(lines.some((l) => l.includes('t         Show / focus the tags pane'))).toBe(true);
  });

  it('5: WHEN <Help width={118} height={34} editor="omawrite" /> and <Help width={312} height={81} editor="omawrite" /> are rendered THEN the first frame has at most 34 lines, no line longer than 118 characters and does not contain "Tags (note)", and the second frame has exactly 32 lines', () => {
    const first = frameLines(<Help width={118} height={34} editor="omawrite" />);
    expect(first.length).toBeLessThanOrEqual(34);
    for (const line of first) expect(line.length).toBeLessThanOrEqual(118);
    expect(first.some((l) => l.includes('Tags (note)'))).toBe(false);
    const second = frameLines(<Help width={312} height={81} editor="omawrite" />);
    // T315.2: layoutHelp grew from 29 to 30 lines, so wideLines.length+2 is 32.
    expect(second).toHaveLength(32);
  });

  it('6: WHEN <Help width={100} height={30} editor="omawrite" /> is rendered THEN the frame contains "Help - Keyboard Shortcuts" and contains "Search notes"', () => {
    const frame = frameLines(<Help width={100} height={30} editor="omawrite" />).join('\n');
    expect(frame.includes('Help - Keyboard Shortcuts')).toBe(true);
    expect(frame.includes('Search notes')).toBe(true);
  });
});
