/**
 * T279 Regression: publish/unpublish, offline-then-online edits, and safe logout.
 *
 * Tests with the REAL client wiring (`buildStore`, disk `FileGhostStore`)
 * that publish/unpublish reach the server, offline edits queue and replay on
 * reconnect, and logout succeeds when nothing is unsynced.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { logout } from '../../src/core/token';

const APP_ID = 'test-app';
const TOKEN = 'test-token';
const USERNAME = 'test@example.com';

function noteData(content: string, systemTags: string[] = []): Record<string, unknown> {
  const now = Date.now();
  return {
    content,
    creationDate: now,
    deleted: 0,
    modificationDate: now,
    systemTags,
    tags: [],
  };
}

/** Poll every 50 ms up to `timeoutMs` (never sleeps past a poll step). */
async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  label: string
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

interface Fixture {
  server: FakeSimperiumServer;
  dir: string;
  store: ReturnType<typeof buildStore>['store'];
  stopSaving: () => void;
  logLines: string[];
  warn: ReturnType<typeof vi.spyOn>;
}

/**
 * FakeSimperiumServer seeded with one note `existing1` (content
 * "Original content", version 1), a fresh temp dataDir, and buildStore
 * wired to it.
 */
async function fixture(
  seedData: Record<string, unknown> = noteData('Original content')
): Promise<Fixture> {
  const server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'existing1', data: seedData, version: 1 },
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'snote-t279-'));
  const logLines: string[] = [];
  const warn = vi
    .spyOn(console, 'warn')
    .mockImplementation((...args: unknown[]) => {
      logLines.push(args.map((a) => String(a)).join(' '));
    });

  const { store, stopSaving } = buildStore(
    { dataDir: dir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
    { email: USERNAME, token: TOKEN },
    () => {}
  );

  // Index done: the store holds only the seeded existing1.
  await waitFor(
    () => store.getState().data.notes.size === 1 &&
      store.getState().data.notes.has('existing1' as never),
    2500,
    'initial index of existing1'
  );

  return { server, dir, store, stopSaving, logLines, warn };
}

async function teardown(f: Fixture): Promise<void> {
  f.stopSaving();
  f.warn.mockRestore();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  f.server.stop();
  rmSync(f.dir, { recursive: true, force: true });
}

const count = (f: Fixture): number => pendingCount(f.store.getState().simperium);
const serverContent = (f: Fixture, id: string): unknown =>
  f.server.getObject(APP_ID, 'note', id)?.data.content;
const serverSystemTags = (f: Fixture, id: string): unknown[] =>
  (f.server.getObject(APP_ID, 'note', id)?.data.systemTags as string[]) ?? [];

function publishNote(noteId: string, shouldPublish: boolean) {
  return {
    type: 'PUBLISH_NOTE' as never,
    noteId: noteId as never,
    shouldPublish,
  };
}

function editNote(id: string, content: string) {
  return {
    type: 'EDIT_NOTE' as never,
    noteId: id as never,
    changes: { content } as never,
  };
}

/** Set navigator.onLine to false. */
function goOffline(): void {
  (navigator as { onLine: boolean }).onLine = false;
}

/** Set navigator.onLine to true and tell window the machine is back. */
function goOnline(): void {
  (navigator as { onLine: boolean }).onLine = true;
  window.dispatchEvent(new Event('online'));
}

describe('T279 publish/unpublish, offline-then-online, safe logout', () => {
  it('1: WHEN PUBLISH_NOTE with shouldPublish true is dispatched for the pre-seeded existing1 (systemTags: []) THEN within 5 s the server\'s existing1 has systemTags containing published and pendingCount is 0', async () => {
    const f = await fixture(noteData('Original content', []));
    try {
      f.store.dispatch(publishNote('existing1', true));

      await waitFor(
        () =>
          serverSystemTags(f, 'existing1').includes('published') &&
          count(f) === 0,
        5000,
        'systemTags contains published and pendingCount 0'
      );

      expect(serverSystemTags(f, 'existing1')).toContain('published');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('2: WHEN PUBLISH_NOTE with shouldPublish false is dispatched for the pre-seeded existing1 (systemTags: [published]) THEN within 5 s the server\'s existing1 has systemTags [] and pendingCount is 0', async () => {
    const f = await fixture(noteData('Original content', ['published']));
    try {
      f.store.dispatch(publishNote('existing1', false));

      await waitFor(
        () =>
          serverSystemTags(f, 'existing1').length === 0 &&
          !serverSystemTags(f, 'existing1').includes('published') &&
          count(f) === 0,
        5000,
        'systemTags empty and pendingCount 0'
      );

      expect(serverSystemTags(f, 'existing1')).not.toContain('published');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('3: WHEN goOffline() is called then EDIT_NOTE sets existing1\'s content to edited while offline and 300 ms pass THEN the server\'s existing1 content is still Original content and pendingCount is 1', async () => {
    const f = await fixture(noteData('Original content'));
    try {
      goOffline();
      f.store.dispatch(editNote('existing1', 'edited while offline'));

      await new Promise((r) => setTimeout(r, 300));

      expect(serverContent(f, 'existing1')).toBe('Original content');
      expect(count(f)).toBe(1);
    } finally {
      await teardown(f);
    }
  });

  it('4: WHEN, after line 3, goOnline() is called THEN within 5 s the server\'s existing1 has content edited while offline and pendingCount is 0', async () => {
    const f = await fixture(noteData('Original content'));
    try {
      goOffline();
      f.store.dispatch(editNote('existing1', 'edited while offline'));

      await new Promise((r) => setTimeout(r, 300));

      goOnline();

      await waitFor(
        () =>
          serverContent(f, 'existing1') === 'edited while offline' &&
          count(f) === 0,
        5000,
        'server content updated and pendingCount 0'
      );

      expect(serverContent(f, 'existing1')).toBe('edited while offline');
      expect(count(f)).toBe(0);
    } finally {
      await teardown(f);
    }
  });

  it('5: WHEN pendingCount is 0 and logout(dir) is called with the fixture\'s own temp dataDir (dir) THEN within 2 s fs.readdirSync(dir) is []', async () => {
    const f = await fixture(noteData('Original content'));
    try {
      // Verify dir has files before logout
      expect(readdirSync(f.dir).length).toBeGreaterThan(0);

      // pendingCount should be 0 (fully synced)
      expect(count(f)).toBe(0);

      const dir = f.dir;
      await logout(dir);

      await waitFor(
        () => readdirSync(dir).length === 0,
        2000,
        'dataDir is empty after logout'
      );

      expect(readdirSync(dir)).toEqual([]);
    } finally {
      await teardown(f);
    }
  });
});
