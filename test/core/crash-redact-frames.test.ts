/**
 * #56: a frame-shaped line that is not a real frame of the verified top
 * region (message text, or a cause section) is dropped; real frames stay.
 */
import { describe, it, expect } from 'vitest';

import { crashReport } from '../../src/core/crash-report';
import { redactStoredError } from '../../src/core/crash-redact';
import type { CrashContext } from '../../src/core/crash-report';
import { hostileText } from '../fixtures/hostile';

const ctx: CrashContext = {
  version: '0.0.1',
  columns: 120,
  rows: 32,
  when: new Date('2026-09-20T01:02:03.000Z'),
  home: '/home/someone',
};

function report(message: string, stack: string) {
  const err = new Error(message);
  err.stack = stack;
  return crashReport(err, ctx).record;
}

describe('#56 crash-redact frames', () => {
  it('1: WHEN `err.message` is `boom` and `err.stack` is `Error: boom`, a frame `    at g (/x/snote-main.js:3:4)`, a line `Caused by: Error: data` and a frame `    at secret (/home/x/notes.txt:1:1)` THEN `record.error.stack` equals `[\'    at g (/x/snote-main.js:3:4)\']` and the record has neither `secret` nor `notes.txt`', () => {
    const record = report(
      'boom',
      'Error: boom\n    at g (/x/snote-main.js:3:4)\nCaused by: Error: data\n    at secret (/home/x/notes.txt:1:1)',
    );
    expect(record.error.stack).toEqual(['    at g (/x/snote-main.js:3:4)']);
    const text = JSON.stringify(record);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('notes.txt');
  });

  it('2: WHEN a real `new Error(\'boom\', { cause })` is made, whose cause message is `CAUSEMARK` THEN `record.error.stack` equals the first 12 lines of `err.stack` that start with `    at ` byte for byte (a path segment starting with `@` shown as `<w>`), includes one containing `crash-redact-frames.test`, and the record has no `CAUSEMARK`', () => {
    const err = new Error('boom', { cause: new Error('CAUSEMARK') });
    const { record } = crashReport(err, ctx);
    const expected = (err.stack ?? '').split('\n').filter((l) => l.startsWith('    at ')).slice(0, 12).map((l) => l.replace(/@[^/]*/g, '<w>'));
    expect(expected.length).toBeGreaterThanOrEqual(2);
    expect(record.error.stack).toEqual(expected);
    expect(record.error.stack.some((l) => l.includes('crash-redact-frames.test'))).toBe(true);
    expect(JSON.stringify(record)).not.toContain('CAUSEMARK');
  });

  it('3: WHEN `err.message` is `first\\n    at secret (/home/x/notes.txt:1:1)\\nlast` and `err.stack` is `Error: ` plus the message plus the frame `    at g (/x/b.js:3:4)` THEN `record.error.stack` equals `[\'    at g (/x/b.js:3:4)\']` and the record has neither `secret` nor `notes.txt`', () => {
    const message = 'first\n    at secret (/home/x/notes.txt:1:1)\nlast';
    const record = report(message, `Error: ${message}\n    at g (/x/b.js:3:4)`);
    expect(record.error.stack).toEqual(['    at g (/x/b.js:3:4)']);
    const text = JSON.stringify(record);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('notes.txt');
  });

  it('4: WHEN `err.message` is `hostileText(\'boom\')` plus `\\n    at secret (/home/x/notes.txt:1:1)` and `err.stack` is `Error: ` plus the message plus the frame `    at g (/x/b.js:3:4)` THEN `record.error.stack` equals `[\'    at g (/x/b.js:3:4)\']` and the record matches none of `[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e]`, `secret`, `notes.txt`', () => {
    const message = `${hostileText('boom')}\n    at secret (/home/x/notes.txt:1:1)`;
    const record = report(message, `Error: ${message}\n    at g (/x/b.js:3:4)`);
    expect(record.error.stack).toEqual(['    at g (/x/b.js:3:4)']);
    const text = JSON.stringify(record);
    expect(text).not.toMatch(/[\u0000-\u001f\u007f-\u009f‪-‮]/);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('notes.txt');
  });

  it('5: WHEN `err.message` is `boom` and `err.stack` is `Error: boom`, a frame `    at g (/x/b.js:3:4)`, then one of the lines `Caused by: Error: data`, `caused by: Error: data`, `[cause]: Error: data` or `  [errors]: [`, then a frame `    at secret (/home/x/notes.txt:1:1)` THEN `record.error.stack` equals `[\'    at g (/x/b.js:3:4)\']` for each; with the stack `Error: other` plus the same frame `record.error.stack` equals `[]` (crash-redact.test.ts tests 7, 8 and 10 stay green)', () => {
    for (const marker of ['Caused by: Error: data', 'caused by: Error: data', '[cause]: Error: data', '  [errors]: [']) {
      const a = report('boom', `Error: boom\n    at g (/x/b.js:3:4)\n${marker}\n    at secret (/home/x/notes.txt:1:1)`);
      expect(a.error.stack).toEqual(['    at g (/x/b.js:3:4)']);
      expect(JSON.stringify(a)).not.toContain('notes.txt');
    }
    const b = report('boom', 'Error: other\n    at g (/x/b.js:3:4)');
    expect(b.error.stack).toEqual([]);
  });

  it('6: WHEN a stored error has the message `first\\n    at secret (/home/x/notes.txt:1:1)\\nlast` and the stack array `Error: first`, `    at secret (/home/x/notes.txt:1:1)`, `last`, `    at g (/x/b.js:3:4)` THEN `redactStoredError` gives the stack `[\'    at g (/x/b.js:3:4)\']`; a stored stack of `[\'    at g (/x/b.js:3:4)\']` alone stays `[\'    at g (/x/b.js:3:4)\']`, and a stored stack with a non-frame line and a message that is not a string gives `[]`', () => {
    const old = redactStoredError(
      {
        name: 'Error',
        message: 'first\n    at secret (/home/x/notes.txt:1:1)\nlast',
        stack: ['Error: first', '    at secret (/home/x/notes.txt:1:1)', 'last', '    at g (/x/b.js:3:4)'],
      },
      '/home/someone',
    ) as { stack: string[] };
    expect(old.stack).toEqual(['    at g (/x/b.js:3:4)']);
    expect(JSON.stringify(old)).not.toContain('notes.txt');
    const live = redactStoredError(
      { name: 'Error', message: 'boom', stack: ['    at g (/x/b.js:3:4)'] },
      '/home/someone',
    ) as { stack: string[] };
    expect(live.stack).toEqual(['    at g (/x/b.js:3:4)']);
    const odd = redactStoredError(
      { name: 'Error', message: 5, stack: ['Error: 5', '    at secret (/home/x/notes.txt:1:1)'] },
      '/home/someone',
    ) as { stack: string[] };
    expect(odd.stack).toEqual([]);
  });
});
