import { describe, it, expect } from 'vitest';

import { crashReport } from '../../src/core/crash-report';
import type { CrashContext } from '../../src/core/crash-report';

const ctx: CrashContext = {
  version: '0.0.1',
  columns: 120,
  rows: 32,
  when: new Date('2026-09-20T01:02:03.000Z'),
  home: '/home/someone',
};

describe('crash-report', () => {
  it('1: WHEN crashReport(new Error("boom"), ctx) is called THEN record.version is 0.0.1, record.terminal is 120x32, record.when is 2026-09-20T01:02:03.000Z and record.error.name is Error', () => {
    const result = crashReport(new Error('boom'), ctx);
    expect(result.record.version).toBe('0.0.1');
    expect(result.record.terminal).toBe('120x32');
    expect(result.record.when).toBe('2026-09-20T01:02:03.000Z');
    expect(result.record.error.name).toBe('Error');
  });

  it('2: WHEN the error\'s stack contains the line at /home/someone/app/x.js:1:1 THEN record.error.stack[0] contains ~/app/x.js and contains no /home/someone', () => {
    const err = new Error('stacktest');
    // Make the stack's first line be the path we want replaced
    err.stack = `    at /home/someone/app/x.js:1:1\n    at other:1:1`;
    const result = crashReport(err, ctx);
    expect(result.record.error.stack[0]).toContain('~/app/x.js');
    expect(result.record.error.stack[0]).not.toContain('/home/someone');
  });

  it('3: WHEN the error\'s stack has 20 lines THEN record.error.stack has length 12', () => {
    const lines = ['Error: longstack'];
    for (let i = 1; i < 20; i++) {
      lines.push(`    at line${i}:1:1`);
    }
    const err = new Error('longstack');
    err.stack = lines.join('\n');
    const result = crashReport(err, ctx);
    expect(result.record.error.stack.length).toBe(12);
  });

  it('4: WHEN the error\'s message is \'x\' repeated 500 times THEN record.error.message has length 200', () => {
    const longMsg = 'x'.repeat(500);
    const err = new Error(longMsg);
    const result = crashReport(err, ctx);
    expect(result.record.error.message.length).toBe(200);
  });

  it('5: WHEN crashReport("just a string", ctx) and crashReport(undefined, ctx) are called THEN neither throws, both give record.error.name Unknown, and record.error.stack is an array', () => {
    const result1 = crashReport('just a string', ctx);
    expect(result1.record.error.name).toBe('Unknown');
    expect(Array.isArray(result1.record.error.stack)).toBe(true);

    const result2 = crashReport(undefined, ctx);
    expect(result2.record.error.name).toBe('Unknown');
    expect(Array.isArray(result2.record.error.stack)).toBe(true);
  });

  it('6: WHEN any of the calls above is made THEN message split on \\n has length 3, its first line is snote hit a bug and stopped., its second contains {path} and JSON.stringify(record) contains neither /home/someone nor the word content', () => {
    const result = crashReport('just a string', ctx);
    const messageLines = result.message.split('\n');
    expect(messageLines.length).toBe(3);
    expect(messageLines[0]).toBe('snote hit a bug and stopped.');
    expect(messageLines[1]).toContain('{path}');

    const jsonStr = JSON.stringify(result.record);
    expect(jsonStr).not.toContain('/home/someone');
    expect(jsonStr).not.toContain('content');
  });
});
