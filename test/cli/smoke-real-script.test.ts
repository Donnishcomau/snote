/**
 * T20: the real-account smoke script.
 * One `it()` per numbered Acceptance line.
 *
 * The test is the fake: SNOTE_AUTH_BASE (an env the auth call already
 * honours) and `--server` (the flag this script adds) both point at one
 * FakeSimperiumServer, so the whole lifecycle — create, edit, tag, trash,
 * delete forever — runs end to end without ever touching the real service.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';

let server: FakeSimperiumServer;

/**
 * `npm run smoke:real`, as the user types it: node + the script, plus the
 * env the script reads itself. `extraEnv: null` strips a key entirely, so
 * the skip path is reproducible even when SNOTE_TEST_* leak in from the
 * outside. Output is piped and read by hand: the script's own stdout is a
 * PTY when vitest runs in one, and a PTY would echo the very auth POST
 * body that carries the password (which line 4 is about).
 */
function run(
  extraEnv: Record<string, string | null> = {},
  args: string[] = []
): Promise<{ status: number | null; all: string }> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === null) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke-real.mjs', ...args], {
      env: env as NodeJS.ProcessEnv,
    });
    let all = '';
    child.stdout.on('data', (d) => (all += d));
    child.stderr.on('data', (d) => (all += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, all }));
  });
}

function noteIdFrom(out: string): string {
  const match = out.match(/smoke-real: note=([0-9a-f-]+)/);
  expect(match).not.toBeNull();
  return match![1];
}

/** Seed the one note the fake's index then answers with, so the script's
 *  waitForNotes resolves before it starts dispatching. */
function seedFixture(server: FakeSimperiumServer): void {
  const now = Date.now();
  server.seedBucket('test-app', 'note', [
    {
      id: 'seed1',
      data: {
        content: 'seed content',
        creationDate: now,
        deleted: 0,
        modificationDate: now,
        systemTags: [],
        tags: [],
      },
    },
  ]);
}

const fixtureEnv = (): Record<string, string> => ({
  SNOTE_TEST_EMAIL: 'test@example.com',
  SNOTE_TEST_PASSWORD: 'correct-horse',
  SNOTE_APP_ID: 'test-app',
  SNOTE_AUTH_BASE: server.url.replace(/^ws:/, 'http:'),
});

/** Poll a condition that involves server state; the server only answers
 *  while this process is alive, so a child's writes may still be landing. */
async function untilTrue(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for the fake server to catch up');
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

let skipRun: { status: number | null; all: string };
let goodRun: { status: number | null; all: string };
let badRun: { status: number | null; all: string };

describe('T20 smoke:real script', () => {
  beforeAll(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    skipRun = await run({ SNOTE_TEST_EMAIL: null, SNOTE_TEST_PASSWORD: null });
    seedFixture(server);
    goodRun = await run(fixtureEnv(), ['--server', server.url]);
    badRun = await run(
      { ...fixtureEnv(), SNOTE_TEST_PASSWORD: 'wrong-password' },
      ['--server', server.url]
    );
  }, 90000);

  afterAll(() => {
    server.stop();
  });

  it("1: WHEN `node scripts/smoke-real.mjs` is spawned with neither `SNOTE_TEST_EMAIL` nor `SNOTE_TEST_PASSWORD` set THEN within `2` s it exits with status `0`, stdout contains a line starting with `smoke-real: skipped`, and `server.received` is empty", async () => {
    const fresh = new FakeSimperiumServer();
    await fresh.start();
    const started = Date.now();
    const result = await run(
      { SNOTE_TEST_EMAIL: null, SNOTE_TEST_PASSWORD: null },
      ['--server', fresh.url]
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.status).toBe(0);
    expect(
      result.all.split('\n').some((line) => line.startsWith('smoke-real: skipped'))
    ).toBe(true);
    expect(fresh.received).toEqual([]);
    fresh.stop();
  }, 15000);

  it("2: WHEN it is spawned with the fixture env and `--server` THEN within `15` s it exits with status `0` and stdout contains, in order, `smoke-real: created`, `smoke-real: edited`, `smoke-real: tagged`, `smoke-real: trashed`, `smoke-real: deleted` and `smoke-real: ok`", async () => {
    const fresh = new FakeSimperiumServer();
    await fresh.start();
    seedFixture(fresh);
    const started = Date.now();
    const result = await run(
      { ...fixtureEnv(), SNOTE_AUTH_BASE: fresh.url.replace(/^ws:/, 'http:') },
      ['--server', fresh.url]
    );
    expect(Date.now() - started).toBeLessThan(15000);
    expect(result.status).toBe(0);
    const out = result.all;
    let last = -1;
    for (const stage of [
      'smoke-real: created',
      'smoke-real: edited',
      'smoke-real: tagged',
      'smoke-real: trashed',
      'smoke-real: deleted',
      'smoke-real: ok',
    ]) {
      const at = out.indexOf(stage);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    fresh.stop();
  }, 30000);

  it("3: WHEN the id is read from that run's `smoke-real: note=` line THEN `server.getObject('test-app', 'note', id)` is `undefined`", async () => {
    const id = noteIdFrom(goodRun.all);
    // pendingCount already reached 0 in the child (that is what
    // `smoke-real: ok` means); this poll only lets those final frames
    // finish landing in the server's in-memory storage.
    await untilTrue(() => server.getObject('test-app', 'note', id) === undefined, 3000);
    expect(server.getObject('test-app', 'note', id)).toBeUndefined();
    // The fixture's own note was never touched.
    expect(server.getObject('test-app', 'note', 'seed1')).toBeDefined();
  }, 15000);

  it("4: WHEN that run's stdout and stderr are read together THEN neither contains `correct-horse`", () => {
    expect(goodRun.all).not.toContain('correct-horse');
  });

  it("5: WHEN the same fixture is used but `SNOTE_TEST_PASSWORD` is `wrong-password` THEN within `10` s it exits with a status other than `0`, stdout contains `error:` and not `smoke-real: ok`, and `server.received` contains no `:c:` frame (nothing was created)", async () => {
    const fresh = new FakeSimperiumServer();
    await fresh.start();
    seedFixture(fresh);
    const started = Date.now();
    const result = await run(
      {
        ...fixtureEnv(),
        SNOTE_TEST_PASSWORD: 'wrong-password',
        SNOTE_AUTH_BASE: fresh.url.replace(/^ws:/, 'http:'),
      },
      ['--server', fresh.url]
    );
    expect(Date.now() - started).toBeLessThan(10000);
    expect(result.status).not.toBe(0);
    expect(result.all).toContain('error:');
    expect(result.all).not.toContain('smoke-real: ok');
    expect(fresh.received.filter((line) => line.includes(':c:'))).toEqual([]);
    fresh.stop();
  }, 20000);

  it("6: WHEN `Makefile` is read as text THEN its `check:` recipe does not contain `smoke-real`, and `package.json`'s \"smoke:real\" script equals `node scripts/smoke-real.mjs`", () => {
    const makefile = readFileSync('Makefile', 'utf8');
    const recipe = makefile
      .split('\n')
      .slice(makefile.split('\n').indexOf('check:'))
      .filter((line) => /^\t/.test(line))
      .join('\n');
    expect(recipe).not.toContain('smoke-real');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['smoke:real']).toBe('node scripts/smoke-real.mjs');
  });
});
