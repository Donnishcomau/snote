/**
 * T281 — T272's fix must survive a real "invalid version" reply.
 *
 * The fake server now answers `e:<id>.undefined` (a non-numeric version
 * token) with the protocol's "invalid version" marker `\n?`, exactly as
 * the real Simperium service is reported to do. `onVersion` swallows that
 * marker without emitting, so a fix that only aliases the server reply
 * never fires; the replacement fix intercepts the OUTBOUND request and
 * resolves it locally, so these scenarios must still settle.
 *
 * Fixture: FakeSimperiumServer seeded with one note `existing1`
 * (content `Original content`, version 1), `buildStore` pointed at it
 * with a fresh temp dataDir; the server answers a non-numeric version
 * request with `\n?`.
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
 * dataDir, and buildStore wired to it. `logLines` captures console.warn
 * so a logout caused by an unexpected wire reply becomes a test-visible
 * failure instead of a silent stall.
 */
async function fixture(): Promise<Fixture> {
  const server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'existing1', data: noteData('Original content'), version: 1 },
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'snote-t281-'));
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

describe('T281 a brand-new note resolves locally against a strict server', () => {
  it('1: WHEN CREATE_NOTE_WITH_ID for new1 with content Title\\nbody one is dispatched THEN within 8 s the server\'s new1 has content Title\\nbody one and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'Title\nbody one';
      f.store.dispatch(createWithId('new1', content));

      await waitFor(
        () => serverContent(f, 'new1') === content && count(f) === 0,
        8000,
        "server new1 content 'Title\\nbody one' and pendingCount 0"
      );

      expect(serverContent(f, 'new1')).toBe('Title\nbody one');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('2: WHEN CREATE_NOTE_WITH_ID for new2 with content created is dispatched and, 0 ms later, EDIT_NOTE for new2 sets content to created\\nedited immediately THEN within 8 s the server\'s new2 has content created\\nedited immediately and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'created\nedited immediately';
      f.store.dispatch(createWithId('new2', 'created'));
      f.store.dispatch(editNote('new2', content));

      await waitFor(
        () => serverContent(f, 'new2') === content && count(f) === 0,
        8000,
        "server new2 content 'created\\nedited immediately' and pendingCount 0"
      );

      expect(serverContent(f, 'new2')).toBe('created\nedited immediately');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('3: WHEN CREATE_NOTE_WITH_ID for new3 with content created is dispatched and, 2500 ms later, EDIT_NOTE for new3 sets content to created\\nedited late THEN within 10 s the server\'s new3 has content created\\nedited late and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'created\nedited late';
      f.store.dispatch(createWithId('new3', 'created'));

      await new Promise((r) => setTimeout(r, 2500));

      f.store.dispatch(editNote('new3', content));

      await waitFor(
        () => serverContent(f, 'new3') === content && count(f) === 0,
        10000,
        "server new3 content 'created\\nedited late' and pendingCount 0"
      );

      expect(serverContent(f, 'new3')).toBe('created\nedited late');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('4: WHEN EDIT_NOTE for the pre-existing existing1 sets content to Original content edited THEN within 8 s the server\'s existing1 has content Original content edited and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      const content = 'Original content edited';
      f.store.dispatch(editNote('existing1', content));

      await waitFor(
        () => serverContent(f, 'existing1') === content && count(f) === 0,
        8000,
        "server existing1 content 'Original content edited' and pendingCount 0"
      );

      expect(serverContent(f, 'existing1')).toBe('Original content edited');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });
});
