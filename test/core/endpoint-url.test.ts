/**
 * T474: endpoint overrides are judged by their parsed host, and an address
 * with a username or password is refused. Corrects the text match of T419.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { checkEndpoints } from '../../src/core/endpoint-check';

describe('T474 endpoint-url', () => {
  it("1: WHEN checkEndpoints gets SNOTE_AUTH_BASE set to each of `http://localhost:@evil.example`, `http://127.0.0.1:x@evil.example/` and `http://localhost:80@evil.example` THEN each result has exactly one error", () => {
    for (const value of [
      'http://localhost:@evil.example',
      'http://127.0.0.1:x@evil.example/',
      'http://localhost:80@evil.example',
    ]) {
      const result = checkEndpoints({ SNOTE_AUTH_BASE: value });
      expect(result.errors).toHaveLength(1);
    }
  });

  it("2: WHEN checkEndpoints gets SNOTE_BLOG_ORIGIN set to `https://user:pass@skryf.art` THEN the result has exactly one error", () => {
    const result = checkEndpoints({
      SNOTE_BLOG_ORIGIN: 'https://user:pass@skryf.art',
    });
    expect(result.errors).toHaveLength(1);
  });

  it("3: WHEN checkEndpoints gets SNOTE_ACCOUNT_BASE set to each of `http://localhost:8080`, `http://127.0.0.1/path`, `http://[::1]:9000/`, `HTTP://LOCALHOST/` and `https://app.simplenote.com` THEN each result has no error", () => {
    for (const value of [
      'http://localhost:8080',
      'http://127.0.0.1/path',
      'http://[::1]:9000/',
      'HTTP://LOCALHOST/',
      'https://app.simplenote.com',
    ]) {
      const result = checkEndpoints({ SNOTE_ACCOUNT_BASE: value });
      expect(result.errors).toEqual([]);
    }
  });

  it("4: WHEN checkEndpoints gets SNOTE_AUTH_BASE set to each of `not a url`, `http://evil.example` and `ftp://localhost` THEN each result has exactly one error", () => {
    for (const value of ['not a url', 'http://evil.example', 'ftp://localhost']) {
      const result = checkEndpoints({ SNOTE_AUTH_BASE: value });
      expect(result.errors).toHaveLength(1);
    }
  });

  it("5: WHEN src/core/endpoint-check.ts is read THEN it contains `new URL(` and does not contain `/^(localhost|127`", () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/core/endpoint-check.ts'),
      'utf8'
    );
    expect(src).toContain('new URL(');
    expect(src).not.toContain('/^(localhost|127');
  });
});
