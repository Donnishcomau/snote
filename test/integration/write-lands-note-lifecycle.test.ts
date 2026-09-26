/**
 * T277 Regression: note create/edit/trash/restore/delete-forever writes
 * land on the server.
 *
 * Uses the REAL client wiring (`buildStore`, disk `FileGhostStore`) that
 * T272 verified the confirmation bug against.  Every note write is
 * proven to reach the fake server's stored state, not just local store
 * state.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const TOKEN = 'test-token';
const USERNAME = 'test@example.com';

function noteData(content: string): Record<string, unknown> {
  const now = Date.now();
  return {
    content,
    creationDate: now,
    deleted: 0,
    modificationDate: now,
    systemTags: [],
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
 * FakeSimperiumServer seeded with the one note `existing1`, a fresh temp
 * dataDir, and buildStore wired to it.
 */
async function fixture(): Promise<Fixture> {
  const server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'existing1', data: noteData('Original content'), version: 1 },
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'snote-t277-'));
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
const serverDeleted = (f: Fixture, id: string): unknown =>
  f.server.getObject(APP_ID, 'note', id)?.data.deleted;

function createWithId(id: string, content: string) {
  return {
    type: 'CREATE_NOTE_WITH_ID' as never,
    noteId: id as never,
    note: noteData(content) as never,
  };
}

function editNote(id: string, content: string) {
  return {
    type: 'EDIT_NOTE' as never,
    noteId: id as never,
    changes: { content } as never,
  };
}

describe('T277 write-lands-note-lifecycle', () => {
  it('1: WHEN CREATE_NOTE_WITH_ID for new1 with content First created note is dispatched THEN within 5 s the server\'s new1 has content First created note and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'First created note';
      f.store.dispatch(createWithId('new1', content));

      await waitFor(
        () => serverContent(f, 'new1') === content && count(f) === 0,
        5000,
        "server new1 content 'First created note' and pendingCount 0"
      );

      expect(serverContent(f, 'new1')).toBe('First created note');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('2: WHEN EDIT_NOTE for the pre-seeded existing1 sets content to Original content edited once THEN within 5 s the server\'s existing1 has content Original content edited once and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'Original content edited once';
      f.store.dispatch(editNote('existing1', content));

      await waitFor(
        () => serverContent(f, 'existing1') === content && count(f) === 0,
        5000,
        "server existing1 content 'Original content edited once' and pendingCount 0"
      );

      expect(serverContent(f, 'existing1')).toBe('Original content edited once');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('3: WHEN CREATE_NOTE_WITH_ID for new3 with content created is dispatched and, 2500 ms later, EDIT_NOTE for new3 sets content to created then edited late THEN within 10 s the server\'s new3 has content created then edited late and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'created then edited late';
      f.store.dispatch(createWithId('new3', 'created'));

      await new Promise((r) => setTimeout(r, 2500));

      f.store.dispatch(editNote('new3', content));

      await waitFor(
        () => serverContent(f, 'new3') === content && count(f) === 0,
        10000,
        "server new3 content 'created then edited late' and pendingCount 0"
      );

      expect(serverContent(f, 'new3')).toBe('created then edited late');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('4: WHEN TRASH_NOTE is dispatched for the pre-seeded existing1 (server deleted starts false) THEN within 5 s the server\'s existing1 has deleted true and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({ type: 'TRASH_NOTE' as never, noteId: 'existing1' as never });

      await waitFor(
        () => serverDeleted(f, 'existing1') === true && count(f) === 0,
        5000,
        "server existing1 deleted true and pendingCount 0"
      );

      expect(serverDeleted(f, 'existing1')).toBe(true);
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('5: WHEN, after TRASH_NOTE sets the server\'s existing1 deleted to true, RESTORE_NOTE is dispatched for existing1 THEN within 5 s the server\'s existing1 has deleted false and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({ type: 'TRASH_NOTE' as never, noteId: 'existing1' as never });

      await waitFor(
        () => serverDeleted(f, 'existing1') === true,
        5000,
        'existing1 trashed on server'
      );

      f.store.dispatch({ type: 'RESTORE_NOTE' as never, noteId: 'existing1' as never });

      await waitFor(
        () => serverDeleted(f, 'existing1') === false && count(f) === 0,
        5000,
        "server existing1 deleted false and pendingCount 0"
      );

      expect(serverDeleted(f, 'existing1')).toBe(false);
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('6: WHEN DELETE_NOTE_FOREVER is dispatched for the pre-seeded existing1 THEN within 5 s server.getObject(appId, "note", "existing1") is undefined', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({ type: 'DELETE_NOTE_FOREVER' as never, noteId: 'existing1' as never });

      await waitFor(
        () => f.server.getObject(APP_ID, 'note', 'existing1') === undefined,
        5000,
        'existing1 removed from server'
      );

      expect(f.server.getObject(APP_ID, 'note', 'existing1')).toBeUndefined();
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });
});
