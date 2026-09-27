/**
 * Tests for the fake server's HTTP login routes and httpRequests tracking.
 * Acceptance criteria for T100:
 * 1. request-login JSON body returns 200 and records the request
 * 2. complete-login with valid code returns sync_token
 * 3. complete-login with wrong code returns 401; form text returns 400 with body null
 * 4. authorize with correct password returns access_token and records apiKey
 * 5. authorize with wrong password returns "invalid login"; missing header returns "missing api key"
 * 6. GET to request-login and POST to /nope both return 404 and are recorded
 */
import { describe, it, expect, afterEach } from 'vitest';
import { FakeSimperiumServer } from './server';

describe('fake-simperium server HTTP routes', () => {
  let server: FakeSimperiumServer;

  afterEach(() => {
    server.stop();
  });

  it('1: request-login JSON body returns 200 and records body.username', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    const base = url.replace(/^ws/, 'http');

    const res = await fetch(`${base}/account/request-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'a@b.co', request_source: 'electron' }),
    });

    expect(res.status).toBe(200);
    expect(server.httpRequests).toHaveLength(1);
    expect(server.httpRequests[0].url).toBe('/account/request-login');
    const body = server.httpRequests[0].body as Record<string, unknown>;
    expect(body['username']).toBe('a@b.co');
  });

  it('2: complete-login with valid code returns sync_token', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    const base = url.replace(/^ws/, 'http');

    const res = await fetch(`${base}/account/complete-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'a@b.co', auth_code: 'ABC123' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sync_token).toBe('test-token');
  });

  it('3: complete-login with wrong code returns 401; form text returns 400 with body null', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    const base = url.replace(/^ws/, 'http');

    // Wrong auth code
    const res1 = await fetch(`${base}/account/complete-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'a@b.co', auth_code: 'WRONG1' }),
    });
    expect(res1.status).toBe(401);

    // Form text body (not JSON)
    server.httpRequests = [];
    const res2 = await fetch(`${base}/account/complete-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'auth_code=ABC123',
    });
    expect(res2.status).toBe(400);
    expect(server.httpRequests).toHaveLength(1);
    expect(server.httpRequests[0].body).toBe(null);
  });

  it('4: authorize with correct password returns access_token and records apiKey', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    const base = url.replace(/^ws/, 'http');

    const res = await fetch(`${base}/1/test-app/authorize/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simperium-API-Key': 'k1',
      },
      body: JSON.stringify({ username: 'a@b.co', password: 'correct-horse' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toBe('test-token');
    expect(json.userid).toBe('u1');
    expect(server.httpRequests).toHaveLength(1);
    expect(server.httpRequests[0].apiKey).toBe('k1');
  });

  it('5: authorize with wrong password returns "invalid login"; missing header returns "missing api key"', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    const base = url.replace(/^ws/, 'http');

    // Wrong password
    const res1 = await fetch(`${base}/1/test-app/authorize/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simperium-API-Key': 'k1',
      },
      body: JSON.stringify({ username: 'a@b.co', password: 'nope' }),
    });
    expect(res1.status).toBe(401);
    expect(await res1.text()).toBe('invalid login');

    // Missing API key header
    const res2 = await fetch(`${base}/1/test-app/authorize/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'a@b.co', password: 'correct-horse' }),
    });
    expect(res2.status).toBe(401);
    expect(await res2.text()).toBe('missing api key');
  });

  it('6: GET to request-login and POST to /nope both return 404 and are recorded', async () => {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    const base = url.replace(/^ws/, 'http');

    const res1 = await fetch(`${base}/account/request-login`, {
      method: 'GET',
    });
    expect(res1.status).toBe(404);

    const res2 = await fetch(`${base}/nope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res2.status).toBe(404);

    expect(server.httpRequests).toHaveLength(2);
  });
});
