// Vitest setup file for Node environment
// Provides window shim for vendored Simplenote code

import { Console } from 'node:console';
import { afterAll, beforeAll, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { isolateGitEnv } from './helpers/git-isolation';
import { RUN_ID_ENV, removeIfOwned } from './helpers/tmp-leak';

// #310: the run id (set by test/global-leak-guard.ts) sits in every dir name, so the guard can tell this run's dirs from another run's.
const runTag = process.env[RUN_ID_ENV] ? process.env[RUN_ID_ENV] + '-' : '';

// Vitest 4's console intercept replaces `console` and drops Node's Console
// constructor. Ink's real render (`patch-console`) does `new console.Console`.
if (typeof console.Console !== 'function') {
  Object.defineProperty(console, 'Console', {
    value: Console,
    writable: true,
    configurable: true,
  });
}

// Prevent any test from ever launching a real editor window: point SNOTE_EDITOR at a no-op stand-in named "omawrite" so editor-dependent text stays unchanged.
process.env.SNOTE_EDITOR = path.resolve('test/fixtures/bin/omawrite');

// Never let a test run write the bar status file into the real home directory.
process.env.SNOTE_STATUS_DIR = path.join(os.tmpdir(), 'snote-test-status-' + runTag + process.pid);

// Never let a test run invoke uwsm/create a systemd scope: force the plain-command branch in src/core/editor.ts.
process.env.SNOTE_EDITOR_DIRECT = '1';
process.env.SNOTE_EDITOR_QUICK_MS = '0';

// Never let a test spawn git for a real remote update check: main() now starts one at startup (src/core/update-run.ts).
// The sentinel is `disabled` (not `off`): `off` would also disable the per-test env of test/core/update-check.test.ts,
// whose tests 1-2 spread process.env and must run the check; update-check.runUpdateChecks skips the runner when it sees `disabled`.
process.env.SNOTE_UPDATE_CHECK = 'disabled';

// #278: never let a test's git call resolve to the enclosing worktree (inherited GIT_DIR, scratch dir under the repo).

// #278: never let a test's git call resolve to the enclosing worktree (inherited GIT_DIR, scratch dir under the repo).
isolateGitEnv();

// #656: snote fsyncs every file it writes (src/core/secure-fs.ts). Under host disk load one fsync blocked a test process
// for up to 11 s, so the fake-server tests timed out. No test cuts the power, so code in the test process gets a counted
// no-op (a spawned CLI keeps the real call). proof: test/structure/fsync-stub.test.ts
const fsyncStub = Object.assign((): void => { fsyncStub.calls++; }, { calls: 0, snoteFsyncStub: true as const });
if (!('snoteFsyncStub' in fs.fsyncSync)) { fs.fsyncSync = fsyncStub; syncBuiltinESMExports(); }

// Never let a test read or write the owner's real home: one temp home per test
// process, so HOME and every XDG directory resolve inside os.tmpdir().
// #407: the path is chosen here (HOME and the XDG variables point into it at load) but the directory is made in beforeAll,
// so a test file that runs no test (it skips as a whole, where vitest runs no afterAll) leaves no directory behind.
const testHome = path.join(os.tmpdir(), 'snote-test-home-' + runTag + crypto.randomBytes(3).toString('hex'));
process.env.HOME = testHome;
process.env.XDG_DATA_HOME = path.join(testHome, 'data');
process.env.XDG_STATE_HOME = path.join(testHome, 'state');
process.env.XDG_CONFIG_HOME = path.join(testHome, 'config');
process.env.XDG_CACHE_HOME = path.join(testHome, 'cache');
process.env.XDG_DOCUMENTS_DIR = path.join(testHome, 'Documents');

// #310: remove this file's temp home and status dir when its tests end, passed or failed.
const statusDir = process.env.SNOTE_STATUS_DIR!;
function removeTestHome(): void {
  removeIfOwned(testHome);
  removeIfOwned(statusDir);
}
beforeAll(() => {
  fs.mkdirSync(testHome, { recursive: true, mode: 0o700 });
});
afterAll(removeTestHome);

// Mock navigator.onLine for online/offline detection
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
  },
  writable: true,
});

// Create a proper window shim with event listener support
const eventListeners = new Map<string, Array<(event: Event) => void>>();

const mockWindow = {
  Notification: {
    permission: 'default',
  },
  navigator: global.navigator,
  addEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
    const handlers = eventListeners.get(event) || [];
    handlers.push(handler);
    eventListeners.set(event, handlers);
  }),
  removeEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
    const handlers = eventListeners.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }),
  dispatchEvent: vi.fn((event: Event) => {
    const handlers = eventListeners.get(event.type) || [];
    handlers.forEach((handler) => handler(event));
    return true;
  }),
};

// @ts-expect-error - window may not exist in Node
global.window = mockWindow;
