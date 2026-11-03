// (#626): U+061C (ALM) is stripped; unterminated sequences leave their body as plain text.
import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { sanitizeForTerminal } from '../../src/core/sanitize';
import Preview from '../../src/tui/Preview';
import { makeNote } from '../tui/fixtures';

describe('sanitizeForTerminal controls', () => {
  it('1: WHEN sanitizeForTerminal gets `a\\u061Cb` THEN it returns `ab`', () => {
    expect(sanitizeForTerminal('a\u061Cb')).toBe('ab');
  });

  it('2: WHEN a note whose content holds `x\\u061Cy` is rendered in the Preview pane THEN the frame contains `xy` and not U+061C', () => {
    const note = makeNote('n1', 'x\u061Cy');
    const { lastFrame, unmount } = render(React.createElement(Preview, { note, width: 80, height: 10 }));
    const frame = lastFrame() ?? '';
    unmount();
    expect(frame).toContain('xy');
    expect(frame).not.toContain('\u061C');
  });

  it('3: WHEN sanitizeForTerminal gets the unterminated `\\x1b]0;title` and `x\\x1b[31` THEN it returns exactly `0;title` and `x31`', () => {
    expect(sanitizeForTerminal('\x1b]0;title')).toBe('0;title');
    expect(sanitizeForTerminal('x\x1b[31')).toBe('x31');
  });
});
