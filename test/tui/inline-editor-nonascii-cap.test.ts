import { describe, it, expect } from 'vitest';

import { inlineEditRefusal } from '../../src/tui/inline-editor-state';

const NOTICE = 'The note has over 20,000 non-ASCII characters: press e to edit in your editor';
// 16,000,000 characters, all non-ASCII, no line longer than 10,000 so the
// line-length cap (T456) cannot pre-empt the non-ASCII cap.
const HUGE = ('漢'.repeat(9999) + '\n').repeat(1600);
// Exactly 20,000 non-ASCII characters, two lines of 10,000.
const AT_LIMIT = '漢'.repeat(10000) + '\n' + '漢'.repeat(10000);
// One over the limit.
const OVER_LIMIT = AT_LIMIT + '\n漢';

describe('inline editor non-ASCII cap (#24)', () => {
  it('1: WHEN a 16,000,000-character non-ASCII note is refused THEN inlineEditRefusal returns the notice within 250 ms', () => {
    const started = Date.now();
    expect(inlineEditRefusal(HUGE)).toBe(NOTICE);
    expect(Date.now() - started).toBeLessThan(250);
  });

  it('2: WHEN a note has exactly 20,000 non-ASCII characters THEN inlineEditRefusal returns null', () => {
    expect(inlineEditRefusal(AT_LIMIT)).toBeNull();
  });

  it('3: WHEN a note has 20,001 non-ASCII characters THEN inlineEditRefusal returns the notice', () => {
    expect(inlineEditRefusal(OVER_LIMIT)).toBe(NOTICE);
  });
});
