import { describe, expect, it } from 'vitest';
import { stripUnsafeOutput, guardOutputStream } from '../../src/core/output-guard';

describe('output-guard', () => {
  it('1: WHEN stripUnsafeOutput gets `a\\x1b]52;c;UFdORUQ=\\x07b` and, separately, `a\\x1b]52;c;AA\\x1b\\\\b` (OSC 52 ended by BEL and by ESC backslash) THEN it returns `ab` for each.', () => {
    expect(stripUnsafeOutput('a\x1b]52;c;UFdORUQ=\x07b')).toBe('ab');
    expect(stripUnsafeOutput('a\x1b]52;c;AA\x1b\\b')).toBe('ab');
  });

  it('2: WHEN it gets `a\\x1b]8;;http://x\\x1b\\\\L\\x1b]8;;\\x1b\\\\b` (an OSC 8 hyperlink) and, separately, `a\\x1bPq#0\\x1b\\\\b\\x1b_Gi=1;AA\\x1b\\\\c` (DCS and APC) THEN it returns `aLb` and `abc`.', () => {
    expect(stripUnsafeOutput('a\x1b]8;;http://x\x1b\\L\x1b]8;;\x1b\\b')).toBe('aLb');
    expect(stripUnsafeOutput('a\x1bPq#0\x1b\\b\x1b_Gi=1;AA\x1b\\c')).toBe('abc');
  });

  it('3: WHEN it gets `a\\x9d52;c;AA\\x07b\\x9d52;c;AA\\x9cc` (C1 OSC ended by BEL and by U+009C) and, separately, `a\\x1b]52;c;AA` (no terminator) THEN it returns `abc` and `a`.', () => {
    expect(stripUnsafeOutput('a\x9d52;c;AA\x07b\x9d52;c;AA\x9cc')).toBe('abc');
    expect(stripUnsafeOutput('a\x1b]52;c;AA')).toBe('a');
  });

  it('4: WHEN it gets `a\\x07b\\x08c\\x7fd\\te\\nf\\r` THEN it returns `abcd\\te\\nf\\r`.', () => {
    expect(stripUnsafeOutput('a\x07b\x08c\x7fd\te\nf\r')).toBe('abcd\te\nf\r');
  });

  it('5: WHEN it gets `\\x1b[31mred\\x1b[39m\\x1b[?25l\\x1b[2K\\x1b[1A` and, separately, `héllo ✓ 👍️` THEN each is returned unchanged.', () => {
    const csis = '\x1b[31mred\x1b[39m\x1b[?25l\x1b[2K\x1b[1A';
    const unicode = 'héllo ✓ 👍️';
    expect(stripUnsafeOutput(csis)).toBe('\x1b[31mred\x1b[39m\x1b[?25l\x1b[2K\x1b[1A');
    expect(stripUnsafeOutput(unicode)).toBe('héllo ✓ 👍️');
  });

  it('6: WHEN guardOutputStream wraps a recorder and write(\'x\\x1b]52;c;AA\\x07y\', \'utf8\') then write(Buffer.from(\'a\\x07b\')) are called THEN the recorded first arguments are the strings xy and ab, and guardOutputStream returned the same object.', () => {
    const calls: unknown[][] = [];
    const stream = {
      write(...args: unknown[]): boolean {
        calls.push(args);
        return true;
      },
    };
    const returned = guardOutputStream(stream);
    stream.write('x\x1b]52;c;AA\x07y', 'utf8');
    stream.write(Buffer.from('a\x07b'));
    expect(calls.map((a) => a[0])).toEqual(['xy', 'ab']);
    expect(returned).toBe(stream);
  });
});
