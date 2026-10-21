/**
 * #55: more errno and Node `ERR_` codes survive redaction, as words in the
 * message and as `error.code`; any other code-shaped word is still dropped.
 */
import { describe, it, expect } from 'vitest';

import { crashReport } from '../../src/core/crash-report';
import type { CrashContext } from '../../src/core/crash-report';
import { redactMessage } from '../../src/core/crash-redact';

const ctx: CrashContext = {
  version: '0.0.1',
  columns: 120,
  rows: 32,
  when: new Date('2026-09-20T01:02:03.000Z'),
  home: '/home/someone',
};

const ERRNO = ['ENOSPC', 'ENOTEMPTY', 'EAI_AGAIN', 'EBUSY', 'EINVAL', 'EXDEV', 'EROFS', 'ENFILE'];
const NODE_CODES = [
  'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_OUT_OF_RANGE', 'ERR_STREAM_DESTROYED',
  'ERR_STREAM_PREMATURE_CLOSE', 'ERR_SOCKET_CLOSED', 'ERR_UNHANDLED_REJECTION',
  'ERR_MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM',
];

describe('#55 crash-redact keeps more error codes', () => {
  it('1: WHEN the error code is `ENOSPC` and the message is `ENOSPC: write`, and in further cases each of `ENOTEMPTY`, `EAI_AGAIN`, `EBUSY`, `EINVAL`, `EXDEV`, `EROFS`, `ENFILE`, THEN `record.error.code` is that code and `record.error.message` is `<code>: write`', () => {
    expect(ERRNO).toHaveLength(8);
    for (const code of ERRNO) {
      const { record } = crashReport(Object.assign(new Error(`${code}: write`), { code }), ctx);
      expect(record.error.code).toBe(code);
      expect(record.error.message).toBe(`${code}: write`);
    }
  });

  it('2: WHEN the error code is `ERR_STREAM_PREMATURE_CLOSE` and the message is `[ERR_STREAM_PREMATURE_CLOSE]: read`, and in further cases each of the other eight listed Node codes, THEN `record.error.code` is that code and `record.error.message` is `[<code>]: read`', () => {
    expect(NODE_CODES).toHaveLength(9);
    for (const code of NODE_CODES) {
      const { record } = crashReport(Object.assign(new Error(`[${code}]: read`), { code }), ctx);
      expect(record.error.code).toBe(code);
      expect(record.error.message).toBe(`[${code}]: read`);
    }
  });

  it('3: WHEN the error code is `EZZTOP` and the message is `EZZTOP: write` THEN `record.error` has no `code` key and the message is `<w>: write`; the same holds for `ERR_NOT_LISTED`, `ENOSPC2` and `ERR_STREAM_PREMATURE_CLOSE_X`', () => {
    for (const code of ['EZZTOP', 'ERR_NOT_LISTED', 'ENOSPC2', 'ERR_STREAM_PREMATURE_CLOSE_X']) {
      const { record } = crashReport(Object.assign(new Error(`${code}: write`), { code }), ctx);
      expect('code' in record.error).toBe(false);
      expect(record.error.message).toBe('<w>: write');
      expect(JSON.stringify(record)).not.toContain(code);
    }
  });

  it('4: WHEN the message is `ENOSPC: write \'/home/someone/me@example.com/n.json\' hunter2` THEN `redactMessage` gives `ENOSPC: write <str> <w>`; with `ERR_OUT_OF_RANGE: /home/someone/me@example.com hunter2` it gives `ERR_OUT_OF_RANGE: <w> <w>`', () => {
    expect(redactMessage("ENOSPC: write '/home/someone/me@example.com/n.json' hunter2")).toBe('ENOSPC: write <str> <w>');
    expect(redactMessage('ERR_OUT_OF_RANGE: /home/someone/me@example.com hunter2')).toBe('ERR_OUT_OF_RANGE: <w> <w>');
  });

  it('5: WHEN the message is `enospc err_require_esm enoent` THEN `redactMessage` returns it unchanged (matching ignores case, as for `enoent`), and `ERR ERR_` gives `ERR <w>`', () => {
    expect(redactMessage('enospc err_require_esm enoent')).toBe('enospc err_require_esm enoent');
    expect(redactMessage('ERR ERR_')).toBe('ERR <w>');
  });
});
