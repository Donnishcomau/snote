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

describe('crash-redact', () => {
  it('1: WHEN `crashReport(new Error(\'boom CONTENTMARK hunter2\'), ctx)` runs, and in further cases `crashReport(\'note text hunter2\', ctx)` and an Error whose message is `x` repeated `500` times, THEN the messages are `<w> <w> <w>`, `<w> <w> <w>` and `<w>`, and no `JSON.stringify(record)` contains `CONTENTMARK` or `hunter2`', () => {
    const a = crashReport(new Error('boom CONTENTMARK hunter2'), ctx).record;
    const b = crashReport('note text hunter2', ctx).record;
    const c = crashReport(new Error('x'.repeat(500)), ctx).record;
    expect(a.error.message).toBe('<w> <w> <w>');
    expect(b.error.message).toBe('<w> <w> <w>');
    expect(c.error.message).toBe('<w>');
    for (const record of [a, b, c]) {
      const text = JSON.stringify(record);
      expect(text).not.toContain('CONTENTMARK');
      expect(text).not.toContain('hunter2');
    }
  });

  it('2: WHEN the error\'s stack is `Error: boom CONTENTMARK` plus the frames `    at f (/home/someone/.local/share/snote/me@example.com/a.js:1:2)` and `    at g (/x/snote-main.js:3:4)` and `home` is `/home/someone` THEN `record.error.stack` equals `[\'    at f (~/.local/share/snote/<w>/a.js:1:2)\', \'    at g (/x/snote-main.js:3:4)\']` and the record has neither `CONTENTMARK` nor `me@example.com`', () => {
    const err = new Error('boom CONTENTMARK');
    err.stack = [
      'Error: boom CONTENTMARK',
      '    at f (/home/someone/.local/share/snote/me@example.com/a.js:1:2)',
      '    at g (/x/snote-main.js:3:4)',
    ].join('\n');
    const { record } = crashReport(err, ctx);
    expect(record.error.stack).toEqual([
      '    at f (~/.local/share/snote/<w>/a.js:1:2)',
      '    at g (/x/snote-main.js:3:4)',
    ]);
    const text = JSON.stringify(record);
    expect(text).not.toContain('CONTENTMARK');
    expect(text).not.toContain('me@example.com');
  });

  it('3: WHEN the error is a `TypeError` with `code` `ENOENT` THEN `record.error.name` is `TypeError` and `record.error.code` is `ENOENT`; for `new Error(\'x\')` the key `code` is absent', () => {
    const err = Object.assign(new TypeError('x'), { code: 'ENOENT' });
    const { record } = crashReport(err, ctx);
    expect(record.error.name).toBe('TypeError');
    expect(record.error.code).toBe('ENOENT');
    const plain = crashReport(new Error('x'), ctx).record;
    expect('code' in plain.error).toBe(false);
  });

  it('4: WHEN the message is `ENOENT: no such file or directory, open \'/home/someone/n/me@example.com/state.json\'`, and in a second case `Cannot read properties of undefined (reading \'title\')`, THEN `record.error.message` is `ENOENT: no such file or directory, open <str>` and `Cannot read properties of undefined (reading <str>)`', () => {
    const a = crashReport(
      new Error(
        "ENOENT: no such file or directory, open '/home/someone/n/me@example.com/state.json'",
      ),
      ctx,
    ).record;
    const b = crashReport(
      new Error("Cannot read properties of undefined (reading 'title')"),
      ctx,
    ).record;
    expect(a.error.message).toBe('ENOENT: no such file or directory, open <str>');
    expect(b.error.message).toBe('Cannot read properties of undefined (reading <str>)');
  });

  it('6: WHEN the message is `x\\u001b]52;c;aGk=\\u0007‮` THEN `record.error.message` is non-empty and matches none of `[\\u0000-\\u001f\\u007f-\\u009f‪-‮]`', () => {
    const { record } = crashReport(new Error('x\u001b]52;c;aGk=\u0007‮'), ctx);
    expect(record.error.message).not.toBe('');
    expect(record.error.message).not.toMatch(/[\u0000-\u001f\u007f-\u009f‪-‮]/);
  });

  it('7: WHEN the message is `first\\n    at SECRETFN (/x/me@example.com/x.js:1:1)\\n    at NOTETEXT hunter2\\nlast` and the stack is its header plus the frame `    at g (/x/snote-main.js:3:4)` THEN `record.error.stack` equals `[\'    at g (/x/snote-main.js:3:4)\']` and the record has none of `SECRETFN`, `NOTETEXT`, `hunter2`, `me@example.com`', () => {
    const message =
      'first\n    at SECRETFN (/x/me@example.com/x.js:1:1)\n    at NOTETEXT hunter2\nlast';
    const err = new Error(message);
    err.stack = `Error: ${message}\n    at g (/x/snote-main.js:3:4)`;
    const { record } = crashReport(err, ctx);
    expect(record.error.stack).toEqual(['    at g (/x/snote-main.js:3:4)']);
    const text = JSON.stringify(record);
    for (const leak of ['SECRETFN', 'NOTETEXT', 'hunter2', 'me@example.com']) {
      expect(text).not.toContain(leak);
    }
  });

  it('8: WHEN the message has frame-like lines `    at NOTETEXT hunter2` but the stack header differs from `Error: <message>` THEN `record.error.stack` is `[]` and the record has neither `NOTETEXT` nor `hunter2`; a normal error keeps frames in `record.error.stack`, one containing `crash-redact.test`', () => {
    const err = new Error('a\n    at NOTETEXT hunter2');
    err.stack = 'Error: other\n    at NOTETEXT hunter2\n    at g (/x/snote-main.js:3:4)';
    const { record } = crashReport(err, ctx);
    expect(record.error.stack).toEqual([]);
    const text = JSON.stringify(record);
    expect(text).not.toContain('NOTETEXT');
    expect(text).not.toContain('hunter2');
    const real = crashReport(new Error('boom'), ctx).record.error.stack;
    expect(real.length).toBeGreaterThanOrEqual(2);
    expect(real.some((l) => l.includes('crash-redact.test'))).toBe(true);
  });

  it('9: WHEN the error message is an object, a number, a symbol, `null`, or a getter that throws, and the stack is a number THEN `crashReport` does not throw and `record.error.message` is a string without `CONTENTMARK`', () => {
    const make = (message: unknown) => {
      const e = new Error('x');
      Object.defineProperty(e, 'message', typeof message === 'function' ? { get: message as () => unknown } : { value: message });
      return e;
    };
    const cases = [
      make({ toString: () => 'CONTENTMARK' }),
      make(42),
      make(Symbol('CONTENTMARK')),
      make(null),
      make(() => { throw new Error('CONTENTMARK'); }),
    ];
    const bad = new Error('x');
    Object.defineProperty(bad, 'stack', { value: 7 });
    cases.push(bad);
    const hostile = Object.create(null) as unknown;
    for (const err of [...cases, hostile]) {
      const { record } = crashReport(err, ctx);
      expect(typeof record.error.message).toBe('string');
      expect(JSON.stringify(record)).not.toContain('CONTENTMARK');
    }
  });

  it('10: WHEN the code sets `err.stack` to `custom text\n    at STACKSECRET hunter2 (a)` or to a stack whose header is not `Error: boom` THEN `record.error.stack` is `[]` and the record has neither `STACKSECRET` nor `hunter2`; a real frame after a verified header is still kept', () => {
    const a = new Error('boom');
    a.stack = 'custom text\n    at STACKSECRET hunter2 (a)';
    const b = new Error('boom');
    b.stack = 'Error: other\n    at g (/x/snote-main.js:3:4)';
    const c = new Error('boom');
    c.stack = 'Error: boom\n    at STACKSECRET hunter2 (a)\n    at g (/x/snote-main.js:3:4)';
    for (const err of [a, b]) {
      const { record } = crashReport(err, ctx);
      expect(record.error.stack).toEqual([]);
      expect(JSON.stringify(record)).not.toContain('STACKSECRET');
    }
    const { record } = crashReport(c, ctx);
    expect(record.error.stack).toEqual(['    at g (/x/snote-main.js:3:4)']);
    expect(JSON.stringify(record)).not.toContain('hunter2');
  });
});
