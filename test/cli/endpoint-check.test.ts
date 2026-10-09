/**
 * T419: endpoint overrides must use https (http only for localhost), and
 * turning off TLS checks prints a warning.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';

describe('T419 endpoint-check', () => {
  let dir: string;
  let logged: string[];
  let io: { log: (text: string) => void };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t419-'));
    logged = [];
    io = { log: (text) => logged.push(text) };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN main(['--check', '--data-dir', dir], io) runs with SNOTE_AUTH_BASE `http://evil.example` THEN it resolves 2, a logged line is exactly `error: SNOTE_AUTH_BASE must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])`, and no logged line starts with `editor:`", async () => {
    vi.stubEnv('SNOTE_AUTH_BASE', 'http://evil.example');

    const code = await main(['--check', '--data-dir', dir], io);

    expect(code).toBe(2);
    expect(
      logged.includes(
        'error: SNOTE_AUTH_BASE must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])'
      )
    ).toBe(true);
    expect(logged.some((l) => l.startsWith('editor:'))).toBe(false);
  });

  it("2: WHEN it runs with SNOTE_ACCOUNT_BASE `http://localhost.evil.example` and SNOTE_BLOG_ORIGIN `ftp://x` THEN it resolves 2 and logs one error line naming SNOTE_ACCOUNT_BASE and one naming SNOTE_BLOG_ORIGIN", async () => {
    vi.stubEnv('SNOTE_ACCOUNT_BASE', 'http://localhost.evil.example');
    vi.stubEnv('SNOTE_BLOG_ORIGIN', 'ftp://x');

    const code = await main(['--check', '--data-dir', dir], io);

    expect(code).toBe(2);
    const accountErrors = logged.filter(
      (l) => l.startsWith('error:') && l.includes('SNOTE_ACCOUNT_BASE')
    );
    const blogErrors = logged.filter(
      (l) => l.startsWith('error:') && l.includes('SNOTE_BLOG_ORIGIN')
    );
    expect(accountErrors).toEqual([
      'error: SNOTE_ACCOUNT_BASE must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])',
    ]);
    expect(blogErrors).toEqual([
      'error: SNOTE_BLOG_ORIGIN must be an https:// address without a username or password (http:// is allowed only for localhost, 127.0.0.1 and [::1])',
    ]);
  });

  it("3: WHEN it runs with SNOTE_AUTH_BASE `http://127.0.0.1:8080`, SNOTE_ACCOUNT_BASE `http://localhost:9/x` and SNOTE_BLOG_ORIGIN `https://blog.example` THEN it resolves 0 and no logged line starts with `error:`", async () => {
    vi.stubEnv('SNOTE_AUTH_BASE', 'http://127.0.0.1:8080');
    vi.stubEnv('SNOTE_ACCOUNT_BASE', 'http://localhost:9/x');
    vi.stubEnv('SNOTE_BLOG_ORIGIN', 'https://blog.example');

    const code = await main(['--check', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(logged.some((l) => l.startsWith('error:'))).toBe(false);
  });

  it("4: WHEN it runs with NODE_TLS_REJECT_UNAUTHORIZED `0` THEN it resolves 0 and a logged line is exactly `warning: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checks for login and sync`; with `1` no line starts with `warning:`", async () => {
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');

    const code = await main(['--check', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(
      logged.includes(
        'warning: NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checks for login and sync'
      )
    ).toBe(true);

    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '1');
    logged.length = 0;

    const code2 = await main(['--check', '--data-dir', dir], io);

    expect(code2).toBe(0);
    expect(logged.some((l) => l.startsWith('warning:'))).toBe(false);
  });

  it("5: WHEN main(['--help'], io) runs with SNOTE_AUTH_BASE `http://evil.example` THEN it resolves 0 and logged exactly 1 entry", async () => {
    vi.stubEnv('SNOTE_AUTH_BASE', 'http://evil.example');

    const code = await main(['--help'], io);

    expect(code).toBe(0);
    expect(logged).toHaveLength(1);
  });
});
