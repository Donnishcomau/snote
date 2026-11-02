/**
 * #97: the external editor runs without blocking the event loop. While a
 * terminal editor script sleeps 3 s, snote keeps sending heartbeats (so a
 * server that closes a quiet connection never does), the status stays
 * [connected], a key typed meanwhile never reaches the App, and the text the
 * editor appended is sent once. Setup follows test/tui/history-restore-e2e.test.tsx.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { appendFileSync, statSync, chmodSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import type { State } from '../../src/core/store';
import type { Store } from 'redux';
import { App } from '../../src/tui/App';
import { resetKeyLog } from '../../src/tui/key-ring';
import { draftsDir, setDraftsDir } from '../../src/core/editor-drafts';
import { editInEditor } from '../../src/core/editor';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { renderOnFakeTty } from '../helpers/fake-tty';

const appId = 'test-app';
const now = Math.floor(Date.now() / 1000);
const note = (content: string, modificationDate: number) => ({
  data: { content, creationDate: now, deleted: 0, modificationDate, systemTags: [], tags: [] },
  version: 1,
});
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dirs: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'editor-async-'));
  dirs.push(d);
  return d;
};

// An editor script named `vi` (a terminal editor: stdio inherited, no shell,
// argv = the file). It marks its start, sleeps 3 s, marks its end, appends a line, exits 0.
function sleepingEditor(mark: string, end: string): string {
  const bin = join(scratch(), 'vi');
  writeFileSync(
    bin,
    `#!/bin/sh\nfor f in "$@"; do last="$f"; done\ntouch '${mark}'\nsleep 3\ntouch '${end}'\nprintf '\\nappended line' >> "$last"\nexit 0\n`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

interface Run {
  offlineSeen: boolean;
  alphaSelectedThroughout: boolean;
  betaMarkedAnywhere: boolean;
  beatsDuring: number;
  finalFrame: string;
  changesWithLine: number;
  serverContent: unknown;
  closes: number;
  connections: number;
}
let run: Run;

beforeAll(async () => {
  resetKeyLog();
  const home = scratch();
  setDraftsDir(join(home, 'drafts'));
  const mark = join(home, 'started');
  const end = join(home, 'ended');
  process.env.SNOTE_EDITOR = sleepingEditor(mark, end);
  const server = new FakeSimperiumServer();
  server.closeAfterMissedBeats = 2500; // the client's own limit is 2 x heartbeatInterval = 2 s
  await server.start();
  server.seedBucket(appId, 'note', [
    { id: 'alpha', ...note('Alpha note', now + 10) },
    { id: 'beta', ...note('Beta note', now) },
  ]);
  const store = makeStore({
    sync: {
      appId,
      token: 'test-token',
      username: 'test@example.com',
      clientOptions: { url: server.url, heartbeatInterval: 1 } as { url: string },
      noteEditDelayMs: 10,
    },
  }) as Store<State> & { stopSync?: () => void };
  let unmount: (() => void) | undefined;
  try {
    await waitForNotes(store, 2500);
    const ui = renderOnFakeTty(<App store={store} width={80} height={24} />);
    const { stdin, lastFrame, frames } = ui;
    unmount = ui.unmount;
    await waitForInput(stdin);
    await waitForFrame(lastFrame, (f) => f.includes('[connected]') && f.includes('>Alpha note'), 2500);
    const from = frames.length;
    stdin.write('e');
    for (let i = 0; i < 400 && !existsSync(mark); i++) await sleepMs(10);
    stdin.write('j'); // typed while the editor is open: must not move the selection
    // the editor script runs 3 s; wait for the edit to reach the server
    for (let i = 0; i < 600 && (server.getObject(appId, 'note', 'alpha')?.data.content ?? '') !== 'Alpha note\nappended line'; i++)
      await sleepMs(10);
    const t0 = statSync(mark).mtimeMs;
    const t1 = statSync(end).mtimeMs;
    const duringBeats = server.beatTimes.filter((t) => t > t0 + 20 && t < t1 - 20).length;
    await sleepMs(300);
    const seen = frames.slice(from);
    run = {
      offlineSeen: seen.some((f) => f.includes('[offline]')),
      alphaSelectedThroughout: (lastFrame() ?? '').includes('>Alpha note'),
      betaMarkedAnywhere: seen.some((f) => f.includes('>Beta note')),
      beatsDuring: duringBeats,
      finalFrame: lastFrame() ?? '',
      changesWithLine: server.received.filter((m) => /^\d+:c:/.test(m) && m.includes('appended line')).length,
      serverContent: server.getObject(appId, 'note', 'alpha')?.data.content,
      closes: server.missedBeatCloses,
      connections: server.connectionsOpened,
    };
  } finally {
    unmount?.();
    store.stopSync?.();
    await sleepMs(100);
    server.stop();
  }
}, 25000);

afterAll(() => {
  delete process.env.SNOTE_EDITOR;
  setDraftsDir(null);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('#97 the external editor does not block the event loop', () => {
  it('1: WHEN an editor script sleeps 3 s and heartbeatInterval is 1 THEN the status line never shows `[offline]` from the start of the session to 300 ms after the edit reached the server, and the fake server receives at least `2` h: beats between the start mark and the end mark of the editor script', () => {
    expect(run.offlineSeen).toBe(false);
    expect(run.finalFrame).toContain('[connected]');
    expect(run.beatsDuring).toBeGreaterThanOrEqual(2);
  });

  it('2: WHEN the editor returns having appended a line THEN the change is sent once (content `Alpha note\\nappended line`) and the status line contains `[connected]`', () => {
    expect(run.serverContent).toBe('Alpha note\nappended line');
    expect(run.changesWithLine).toBe(1);
    expect(run.finalFrame).toContain('[connected]');
    expect(run.finalFrame).not.toContain('[offline]');
  });

  it('3: WHEN the server closes a connection that misses beats (closeAfterMissedBeats 2500) THEN it closed `0` connections and saw `1` connection in the session', () => {
    expect(run.closes).toBe(0);
    expect(run.connections).toBe(1);
  });

  it('4: WHEN `j` is typed while the editor is open THEN the selection stays on `>Alpha note` and `>Beta note` is never drawn', () => {
    expect(run.alphaSelectedThroughout).toBe(true);
    expect(run.betaMarkedAnywhere).toBe(false);
  });

  it('5: WHEN a terminal editor runs with an injected stdin THEN the order is `pause`, `child-start`, `child-end`, `resume`: the child spawns while stdin is paused and stdin resumes after the close', async () => {
    const home = scratch();
    setDraftsDir(join(home, 'drafts'));
    const log = join(home, 'order.log');
    const bin = join(scratch(), 'vi');
    writeFileSync(bin, `#!/bin/sh\necho child-start >> '${log}'\necho child-end >> '${log}'\nexit 0\n`);
    chmodSync(bin, 0o755);
    const stdin = {
      pause: () => appendFileSync(log, 'pause\n'),
      resume: () => appendFileSync(log, 'resume\n'),
    };
    await editInEditor('same', { editor: bin, stdin });
    expect(readFileSync(log, 'utf-8').trim().split('\n')).toEqual(['pause', 'child-start', 'child-end', 'resume']);
  });

  it('6: WHEN the editor exits with status `3` THEN editInEditor rejects with `editor failed: exit 3`, stdin is resumed, and the draft stays in a folder under the drafts folder', async () => {
    const home = scratch();
    setDraftsDir(join(home, 'drafts'));
    const bin = join(scratch(), 'vi');
    writeFileSync(bin, '#!/bin/sh\nexit 3\n');
    chmodSync(bin, 0o755);
    const calls: string[] = [];
    const stdin = { pause: () => calls.push('pause'), resume: () => calls.push('resume') };
    await expect(editInEditor('keep me', { editor: bin, stdin })).rejects.toThrow('editor failed: exit 3');
    expect(calls).toEqual(['pause', 'resume']);
    const folders = readdirSync(draftsDir());
    expect(folders).toHaveLength(1);
    const files = readdirSync(join(draftsDir(), folders[0]));
    expect(readFileSync(join(draftsDir(), folders[0], files.find((f) => f.endsWith('.md'))!), 'utf-8')).toBe('keep me');
  });
});
