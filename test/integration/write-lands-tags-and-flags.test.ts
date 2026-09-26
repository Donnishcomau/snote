/**
 * T278 Regression: tag and per-note-flag writes (pin, markdown) land on the server.
 *
 * Prove with the REAL client wiring (buildStore, disk FileGhostStore) that tag
 * edits and note flags actually reach the fake server's stored state.
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

async function fixture(): Promise<Fixture> {
  const server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'existing1', data: noteData('Original content'), version: 1 },
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'snote-t278-'));
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

  await waitFor(
    () => store.getState().data.notes.size === 1 &&
      store.getState().data.notes.has('existing1' as never),
    2500,
    'initial index of existing1'
  );

  return { server, dir, store, stopSaving, logLines, warn };
}

async function fixtureWithTwoTaggedNotes(
  tagName: string
): Promise<Fixture & { twoNoteDir: string }> {
  const server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(APP_ID, 'note', [
    { id: 'noteA', data: noteData('Content A'), version: 1 },
    { id: 'noteB', data: noteData('Content B'), version: 1 },
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'snote-t278-'));
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

  // Seed the initial state with one existing1, plus we will dispatch tag actions
  // to add tags to noteA and noteB.
  await waitFor(
    () => store.getState().data.notes.size === 2 &&
      store.getState().data.notes.has('noteA' as never) &&
      store.getState().data.notes.has('noteB' as never),
    2500,
    'initial index of noteA and noteB'
  );

  // Add the shared tag to both notes so RENAME_TAG / TRASH_TAG have targets
  store.dispatch({
    type: 'ADD_NOTE_TAG' as never,
    noteId: 'noteA' as never,
    tagName: tagName as never,
  });
  store.dispatch({
    type: 'ADD_NOTE_TAG' as never,
    noteId: 'noteB' as never,
    tagName: tagName as never,
  });

  await waitFor(
    () => {
      const a = server.getObject(APP_ID, 'note', 'noteA');
      const b = server.getObject(APP_ID, 'note', 'noteB');
      return (
        a && b &&
        Array.isArray(a.data.tags) && a.data.tags.includes(tagName) &&
        Array.isArray(b.data.tags) && b.data.tags.includes(tagName)
      );
    },
    10000,
    `both notes tagged with ${tagName}`
  );

  return { server, dir, store, stopSaving, logLines, warn, twoNoteDir: dir };
}

async function teardown(f: Fixture): Promise<void> {
  f.stopSaving();
  f.warn.mockRestore();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  f.server.stop();
  rmSync(f.dir, { recursive: true, force: true });
}

const count = (f: Fixture): number => pendingCount(f.store.getState().simperium);
const serverNote = (f: Fixture, id: string): Record<string, unknown> | undefined =>
  f.server.getObject(APP_ID, 'note', id)?.data;

describe('T278 tag and per-note-flag writes land on the server', () => {
  it('1: WHEN ADD_NOTE_TAG for the pre-seeded existing1 (tags: []) with tagName work is dispatched THEN within 5 s the server existing1 has tags containing work and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({
        type: 'ADD_NOTE_TAG' as never,
        noteId: 'existing1' as never,
        tagName: 'work' as never,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.tags) &&
            note.tags.includes('work') &&
            count(f) === 0
          );
        },
        5000,
        'server existing1 has tags containing work and pendingCount 0'
      );

      const note = serverNote(f, 'existing1');
      expect(note).toBeDefined();
      expect(Array.isArray(note!.tags)).toBe(true);
      expect(note!.tags).toContain('work');
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('2: WHEN, after ADD_NOTE_TAG adds work to existing1, REMOVE_NOTE_TAG for existing1 with tagName work is dispatched THEN within 5 s the server existing1 has tags [] and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({
        type: 'ADD_NOTE_TAG' as never,
        noteId: 'existing1' as never,
        tagName: 'work' as never,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.tags) &&
            note.tags.includes('work')
          );
        },
        5000,
        'work tag appeared on server'
      );

      f.store.dispatch({
        type: 'REMOVE_NOTE_TAG' as never,
        noteId: 'existing1' as never,
        tagName: 'work' as never,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.tags) &&
            note.tags.length === 0 &&
            count(f) === 0
          );
        },
        5000,
        'existing1 tags [] and pendingCount 0'
      );

      const note = serverNote(f, 'existing1');
      expect(note).toBeDefined();
      expect(Array.isArray(note!.tags)).toBe(true);
      expect(note!.tags).toEqual([]);
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('3: WHEN RENAME_TAG with oldTagName old and newTagName new is dispatched, where noteA and noteB are pre-seeded with tags: [old] THEN within 5 s the server noteA and noteB each have tags containing new and not containing old', async () => {
    const f = await fixtureWithTwoTaggedNotes('old');
    try {
      f.store.dispatch({
        type: 'RENAME_TAG' as never,
        oldTagName: 'old' as never,
        newTagName: 'new' as never,
      });

      await waitFor(
        () => {
          const a = serverNote(f, 'noteA');
          const b = serverNote(f, 'noteB');
          return (
            a && b &&
            Array.isArray(a.tags) && a.tags.includes('new') && !a.tags.includes('old') &&
            Array.isArray(b.tags) && b.tags.includes('new') && !b.tags.includes('old')
          );
        },
        5000,
        'both notes have new tag, not old'
      );

      const a = serverNote(f, 'noteA');
      const b = serverNote(f, 'noteB');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(Array.isArray(a!.tags)).toBe(true);
      expect(Array.isArray(b!.tags)).toBe(true);
      expect(a!.tags).toContain('new');
      expect(b!.tags).toContain('new');
      expect(a!.tags).not.toContain('old');
      expect(b!.tags).not.toContain('old');
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('4: WHEN TRASH_TAG for tagName temp is dispatched, where noteA and noteB are pre-seeded with tags: [temp] THEN within 5 s the server noteA and noteB each have tags []', async () => {
    const f = await fixtureWithTwoTaggedNotes('temp');
    try {
      f.store.dispatch({
        type: 'TRASH_TAG' as never,
        tagName: 'temp' as never,
      });

      await waitFor(
        () => {
          const a = serverNote(f, 'noteA');
          const b = serverNote(f, 'noteB');
          return (
            a && b &&
            Array.isArray(a.tags) && a.tags.length === 0 &&
            Array.isArray(b.tags) && b.tags.length === 0
          );
        },
        5000,
        'both notes tags [] after TRASH_TAG'
      );

      const a = serverNote(f, 'noteA');
      const b = serverNote(f, 'noteB');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(Array.isArray(a!.tags)).toBe(true);
      expect(Array.isArray(b!.tags)).toBe(true);
      expect(a!.tags).toEqual([]);
      expect(b!.tags).toEqual([]);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('5: WHEN PIN_NOTE with shouldPin true is dispatched for the pre-seeded existing1 (systemTags: []), and after the server existing1 gets systemTags containing pinned PIN_NOTE with shouldPin false is dispatched THEN within 5 s the server existing1 has systemTags [] and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({
        type: 'PIN_NOTE' as never,
        noteId: 'existing1' as never,
        shouldPin: true,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.systemTags) &&
            note.systemTags.includes('pinned')
          );
        },
        5000,
        'existing1 has pinned systemTag'
      );

      f.store.dispatch({
        type: 'PIN_NOTE' as never,
        noteId: 'existing1' as never,
        shouldPin: false,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.systemTags) &&
            note.systemTags.length === 0 &&
            count(f) === 0
          );
        },
        5000,
        'existing1 systemTags [] and pendingCount 0'
      );

      const note = serverNote(f, 'existing1');
      expect(note).toBeDefined();
      expect(Array.isArray(note!.systemTags)).toBe(true);
      expect(note!.systemTags).toEqual([]);
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });

  it('6: WHEN MARKDOWN_NOTE with shouldEnableMarkdown true is dispatched for the pre-seeded existing1 (systemTags: []), and after the server existing1 gets systemTags containing markdown MARKDOWN_NOTE with shouldEnableMarkdown false is dispatched THEN within 5 s the server existing1 has systemTags [] and pendingCount is 0', async () => {
    const f = await fixture();
    try {
      f.store.dispatch({
        type: 'MARKDOWN_NOTE' as never,
        noteId: 'existing1' as never,
        shouldEnableMarkdown: true,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.systemTags) &&
            note.systemTags.includes('markdown')
          );
        },
        5000,
        'existing1 has markdown systemTag'
      );

      f.store.dispatch({
        type: 'MARKDOWN_NOTE' as never,
        noteId: 'existing1' as never,
        shouldEnableMarkdown: false,
      });

      await waitFor(
        () => {
          const note = serverNote(f, 'existing1');
          return (
            note &&
            Array.isArray(note.systemTags) &&
            note.systemTags.length === 0 &&
            count(f) === 0
          );
        },
        5000,
        'existing1 systemTags [] and pendingCount 0'
      );

      const note = serverNote(f, 'existing1');
      expect(note).toBeDefined();
      expect(Array.isArray(note!.systemTags)).toBe(true);
      expect(note!.systemTags).toEqual([]);
      expect(count(f)).toBe(0);
      expect(f.logLines.filter((l) => l.includes('Unauthorized'))).toEqual([]);
    } finally {
      await teardown(f);
    }
  });
});
