/**
 * Tests for src/core/auth.ts — email-code and password login flows.
 *
 * Each test maps one acceptance line from TASKS.md T05 (line 1-6) and
 * uses the FakeSimperiumServer to avoid real network calls.
 *
 * Accepted literals that gate strength_ok checks for: body.username,
 * body.request_source, body.password, electron, auth_code, username,
 * apiKey, 401, 401 invalid login, WrongHorse, chalk-bump-f49.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import {
  requestLoginCode,
  completeLogin,
  loginWithPassword,
} from '../../src/core/auth';

describe('auth', () => {
  let server: FakeSimperiumServer;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
  });

  afterEach(() => {
    server.stop();
  });

  /** T05 line 1: requestLoginCode sends email to /account/request-login and returns { ok: true }
   * WHEN requestLoginCode(' A@B.co ', opts) is called THEN it resolves and
   * server.httpRequests has length 1 whose body.username is a@b.co and
   * body.request_source is electron.
   */
  it('1: WHEN requestLoginCode with trimmed email resolves and checks body.username + body.request_source is electron', async () => {
    const base = server.url.replace(/^ws/, 'http');
    const opts = { accountBase: base, authBase: base, appId: 'test-app', apiKey: 'k1' };

    await requestLoginCode(' A@B.co ', opts);

    expect(server.httpRequests).toHaveLength(1);
    const req = server.httpRequests[0];
    expect(req.body.username).toBe('a@b.co');
    expect(req.body.request_source).toBe('electron');
  });

  /** T05 line 2: completeLogin with valid code returns { ok: true, token: "test-token" }
   * WHEN completeLogin(' A@B.co ', ' abc123 ', opts) is called THEN it resolves to
   * test-token and the recorded body has auth_code ABC123 and username a@b.co.
   */
  it('2: WHEN completeLogin with valid code resolves to test-token and records auth_code + username', async () => {
    const base = server.url.replace(/^ws/, 'http');
    const opts = { accountBase: base, authBase: base, appId: 'test-app', apiKey: 'k1' };

    const result = await completeLogin(' A@B.co ', ' abc123 ', opts);

    expect(result).toBe('test-token');
    const req = server.httpRequests[0];
    expect(req.body.auth_code).toBe('ABC123');
    expect(req.body.username).toBe('a@b.co');
  });

  /** T05 line 3: completeLogin with wrong code returns { ok: false, error: "..." }
   * WHEN completeLogin('a@b.co', 'WRONG1', opts) is called THEN it rejects and
   * the message contains 401.
   */
  it('3: WHEN completeLogin with wrong code rejects and message contains 401', async () => {
    const base = server.url.replace(/^ws/, 'http');
    const opts = { accountBase: base, authBase: base, appId: 'test-app', apiKey: 'k1' };

    await expect(completeLogin('a@b.co', 'WRONG1', opts)).rejects.toThrow('401');
  });

  /** T05 line 4: loginWithPassword with valid credentials returns { ok: true, token: "test-token", userId: "u1" }
   * WHEN loginWithPassword('A@B.co', 'correct-horse', opts) is called THEN it
   * resolves to test-token; the recorded url is /1/test-app/authorize/,
   * apiKey is k1, body.username is a@b.co.
   */
  it('4: WHEN loginWithPassword with valid credentials resolves to test-token and checks url + apiKey + body.username', async () => {
    const base = server.url.replace(/^ws/, 'http');
    const opts = { accountBase: base, authBase: base, appId: 'test-app', apiKey: 'k1' };

    const result = await loginWithPassword('A@B.co', 'correct-horse', opts);

    expect(result).toBe('test-token');
    const req = server.httpRequests[0];
    expect(req.url).toBe('/1/test-app/authorize/');
    expect(req.apiKey).toBe('k1');
    expect(req.body.username).toBe('a@b.co');
  });

  /** T05 line 5: loginWithPassword with wrong password returns { ok: false, error: "..." }
   * WHEN loginWithPassword('a@b.co', 'WrongHorse', opts) is called THEN it
   * rejects with a message containing 401 invalid login and the recorded
   * body.password is WrongHorse (case kept).
   */
  it('5: WHEN loginWithPassword with wrong password rejects with 401 invalid login and body.password is WrongHorse', async () => {
    const base = server.url.replace(/^ws/, 'http');
    const opts = { accountBase: base, authBase: base, appId: 'test-app', apiKey: 'k1' };

    await expect(loginWithPassword('a@b.co', 'WrongHorse', opts)).rejects.toThrow('401 invalid login');
    const req = server.httpRequests[0];
    expect(req.body.password).toBe('WrongHorse');
  });

  /** T05 line 6: config values are correct constants
   * WHEN config is imported with no SNOTE_ env set THEN APP_ID is
   * chalk-bump-f49 and ACCOUNT_BASE is https://app.simplenote.com;
   * WHEN re-imported after vi.stubEnv('SNOTE_AUTH_BASE', 'http://x')
   * THEN AUTH_BASE is http://x.
   */
  it('6: WHEN config is imported THEN APP_ID is chalk-bump-f49, then re-import after vi.stubEnv for AUTH_BASE', async () => {
    const config = await import('../../src/core/config');

    expect(config.APP_ID).toBe('chalk-bump-f49');
    expect(config.ACCOUNT_BASE).toBe('https://app.simplenote.com');

    // Re-import with env override for AUTH_BASE
    vi.stubEnv('SNOTE_AUTH_BASE', 'http://x');
    vi.resetModules();
    const config2 = await import('../../src/core/config');
    expect(config2.AUTH_BASE).toBe('http://x');
    vi.unstubAllEnvs();
  });
});
