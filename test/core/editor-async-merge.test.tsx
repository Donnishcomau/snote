/**
 * #97: another device changes the SAME note while the external editor is open
 * (3 s). Because the event loop keeps running, the remote change reaches the
 * store during the edit; when the editor returns, the two edits are merged
 * (src/core/editor-conflict-merge.ts) and nothing is lost.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import type { State } from '../../src/core/store';
import type { Store } from 'redux';
import { App } from '../../src/tui/App';
import { resetKeyLog } from '../../src/tui/key-ring';
import { setDraftsDir } from '../../src/core/editor-drafts';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { renderOnFakeTty } from '../helpers/fake-tty';

const appId = 'test-app';
const now = Math.floor(Date.now() / 1000);
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirs: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'editor-async-merge-'));
  dirs.push(d);
  return d;
};

let serverContent: unknown;
let storeContent: unknown;
let finalFrame = '';
let remoteSeenWhileOpen = false;

beforeAll(async () => {
  resetKeyLog();
  const home = scratch();
  setDraftsDir(join(home, 'drafts'));
  const mark = join(home, 'started');
  const end = join(home, 'ended');
  const bin = join(scratch(), 'vi');
  writeFileSync(bin, `#!/bin/sh\nfor f in "$@"; do last="$f"; done\ntouch '${mark}'\nsleep 3\ntouch '${end}'\nprintf '\\nappended line' >> "$last"\nexit 0\n`);
  chmodSync(bin, 0o755);
  process.env.SNOTE_EDITOR = bin;
  const server = new FakeSimperiumServer();
  await server.start();
  const data = { content: 'Alpha note', creationDate: now, deleted: 0, modificationDate: now, systemTags: [], tags: [] };
  server.seedBucket(appId, 'note', [{ id: 'alpha', data, version: 1 }]);
  const store = makeStore({
    sync: { appId, token: 'test-token', username: 'test@example.com', clientOptions: { url: server.url, heartbeatInterval: 1 } as { url: string }, noteEditDelayMs: 10 },
  }) as Store<State> & { stopSync?: () => void };
  let unmount: (() => void) | undefined;
  try {
    await waitForNotes(store, 2500);
    const ui = renderOnFakeTty(<App store={store} width={80} height={24} />);
    unmount = ui.unmount;
    await waitForInput(ui.stdin);
    await waitForFrame(ui.lastFrame, (f) => f.includes('[connected]') && f.includes('>Alpha note'), 2500);
    ui.stdin.write('e');
    for (let i = 0; i < 400 && !existsSync(mark); i++) await sleepMs(10);
    // the other device changes the first line while the editor is open
    server.serverChange('note', 'alpha', { ...data, content: 'Alpha note (remote)', modificationDate: now + 5 });
    // the store must hold the remote text while the editor is still open (the end mark does not exist yet)
    const inStore = () => String([...store.getState().data.notes.values()][0]?.content ?? '').includes('(remote)');
    for (let i = 0; i < 400 && !inStore() && !existsSync(end); i++) await sleepMs(10);
    remoteSeenWhileOpen = inStore() && !existsSync(end);
    const want = (c: unknown) => typeof c === 'string' && c.includes('(remote)') && c.includes('appended line');
    for (let i = 0; i < 700 && !want(server.getObject(appId, 'note', 'alpha')?.data.content); i++) await sleepMs(10);
    serverContent = server.getObject(appId, 'note', 'alpha')?.data.content;
    storeContent = [...store.getState().data.notes.values()][0]?.content;
    finalFrame = ui.lastFrame() ?? '';
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

describe('#97 a remote change to the same note while the editor is open', () => {
  it('1: WHEN the fake server changes note `alpha` to `Alpha note (remote)` during the 3 s edit that appends `appended line` THEN the store holds `(remote)` while the editor is still open, and after the return the server and the store hold the same text containing both `(remote)` and `appended line`', () => {
    expect(remoteSeenWhileOpen).toBe(true);
    expect(serverContent).toEqual(storeContent);
    expect(String(serverContent)).toContain('(remote)');
    expect(String(serverContent)).toContain('appended line');
    expect(finalFrame).toContain('[connected]');
  });
});
