/**
 * T373: a request file lets one snote process ask a running snote to open
 * a new note. Core only: no CLI, no TUI, no signals.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  requestNewNote,
  watchNewRequests,
  emitNewRequest,
  onNewRequest,
} from '../../src/core/new-request';

// Poll a condition with a 10 ms step so a late timer only makes a test
// slower, never red. EVERY asserted value sits inside the poll condition.
const waitFor = async (cond: () => boolean, timeoutMs = 1000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('T373 new-note request file', () => {
  let tmpDir: string;
  let child: ChildProcess | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-newreq-'));
  });

  afterEach(() => {
    child?.kill();
    child = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Fixture lock owner: a live `sleep` child whose pid is in instance.lock.
  const lockLiveChild = (): string => {
    child = spawn('sleep', ['30'], { stdio: 'ignore' });
    child.unref();
    fs.writeFileSync(path.join(tmpDir, 'instance.lock'), String(child.pid));
    return String(child.pid);
  };

  it("1: WHEN requestNewNote(dir) runs with instance.lock holding a live sleep child's pid THEN it returns 'sent' and new-note.request exists in dir with statSync(...).mode & 0o777 equal to 0o600", () => {
    lockLiveChild();

    expect(requestNewNote(tmpDir)).toBe('sent');

    const requestPath = path.join(tmpDir, 'new-note.request');
    expect(fs.existsSync(requestPath)).toBe(true);
    expect(fs.statSync(requestPath).mode & 0o777).toBe(0o600);
  });

  it('2: WHEN requestNewNote(dir) runs where instance.lock holds 99999999, and again where dir has no instance.lock THEN both return no-instance and readdirSync(dir) is unchanged (no new-note.request)', () => {
    fs.writeFileSync(path.join(tmpDir, 'instance.lock'), '99999999');

    expect(requestNewNote(tmpDir)).toBe('no-instance');
    expect(fs.readdirSync(tmpDir)).toEqual(['instance.lock']);

    fs.rmSync(path.join(tmpDir, 'instance.lock'));
    const before = fs.readdirSync(tmpDir);

    expect(requestNewNote(tmpDir)).toBe('no-instance');
    expect(fs.readdirSync(tmpDir)).toEqual(before);
    expect(fs.readdirSync(tmpDir)).not.toContain('new-note.request');
  });

  it('3: WHEN watchNewRequests(dir, cb, { pollMs: 20 }) is running and requestNewNote(dir) is called twice in a row THEN, polled up to 1 s, cb was called at least 1 time and new-note.request no longer exists', async () => {
    lockLiveChild();

    let calls = 0;
    const stop = watchNewRequests(tmpDir, () => calls++, { pollMs: 20 });
    try {
      expect(requestNewNote(tmpDir)).toBe('sent');
      expect(requestNewNote(tmpDir)).toBe('sent');

      const requestPath = path.join(tmpDir, 'new-note.request');
      await waitFor(() => calls >= 1 && !fs.existsSync(requestPath));
      expect(calls).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(requestPath)).toBe(false);
    } finally {
      stop();
    }
  });

  it('4: WHEN new-note.request is 60 s old (fixture: utimesSync) and watchNewRequests(dir, cb, { pollMs: 20 }) starts THEN after 200 ms cb was called 0 times and the file is deleted', async () => {
    const requestPath = path.join(tmpDir, 'new-note.request');
    fs.writeFileSync(requestPath, JSON.stringify({ v: 1, t: Date.now() - 60_000 }));
    const old = Date.now() / 1000 - 60;
    fs.utimesSync(requestPath, old, old);

    let calls = 0;
    const stop = watchNewRequests(tmpDir, () => calls++, { pollMs: 20 });
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect(calls).toBe(0);
      expect(fs.existsSync(requestPath)).toBe(false);
    } finally {
      stop();
    }
  });

  it('5: WHEN emitNewRequest() runs with no listener, then onNewRequest(listener) THEN listener is called 1 time; after stop, emitNewRequest() leaves it at 1 and a new onNewRequest(listener2) gets 0 calls', () => {
    let calls1 = 0;
    let calls2 = 0;

    // Emitted while nobody was listening; delivered once at subscribe time.
    emitNewRequest();
    const stop = onNewRequest(() => calls1++);
    expect(calls1).toBe(1);

    // The request belongs to listener1 now. After it unsubscribes, an emit
    // with no listener reaches nobody: listener1 stays at 1.
    stop();
    emitNewRequest();
    expect(calls1).toBe(1);

    // That second request now waits for the next subscriber.
    const stop2 = onNewRequest(() => calls2++);
    expect(calls2).toBe(1);

    // And it is not redelivered a third time: a new subscriber that
    // replaces listener2 while a request was already handed out gets 0.
    stop2();
    const stop3 = onNewRequest(() => calls2++);
    expect(calls2).toBe(1);
    stop3();
  });
});
