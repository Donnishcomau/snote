import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkEndpoints } from '../../src/core/endpoint-check';

describe('endpoint error wording (T477)', () => {
  it('1: WHEN `checkEndpoints` gets `SNOTE_AUTH_BASE` set to `https://user:pass@x.example` THEN its only error is exactly `error: SNOTE_AUTH_BASE must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])`', () => {
    const result = checkEndpoints({ SNOTE_AUTH_BASE: 'https://user:pass@x.example' });
    expect(result.errors).toEqual([
      'error: SNOTE_AUTH_BASE must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])',
    ]);
  });

  it('2: WHEN it gets `SNOTE_BLOG_ORIGIN` set to `http://evil.example` THEN its only error ends with `(http:// is allowed only for localhost, 127.0.0.1 and [::1])`', () => {
    const result = checkEndpoints({ SNOTE_BLOG_ORIGIN: 'http://evil.example' });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].endsWith('(http:// is allowed only for localhost, 127.0.0.1 and [::1])')).toBe(true);
  });

  it('3: WHEN src/core/endpoint-check.ts is read THEN it does not contain `must start with https://`', () => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'src/core/endpoint-check.ts'), 'utf8');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('must start with https://');
  });
});
