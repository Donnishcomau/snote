// Vitest setup file for Node environment
// Provides window shim for vendored Simplenote code

import { Console } from 'node:console';
import { vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';

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
process.env.SNOTE_STATUS_DIR = path.join(os.tmpdir(), 'snote-test-status-' + process.pid);

// Never let a test run invoke uwsm/create a systemd scope: force the plain-command branch in src/core/editor.ts.
process.env.SNOTE_EDITOR_DIRECT = '1';

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
