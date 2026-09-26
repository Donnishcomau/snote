/**
 * T28 Resume sync from disk without a full index
 * Tests that a restarted app shows saved notes immediately and requests only changes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { FileGhostStore } from '../../src/core/ghost-store';
import { saveState, loadState } from '../../src/core/persistence';

vi.setConfig({ testTimeout: 15000 });

describe('T28 Resume sync from disk', () => {
  let server: FakeSimperiumServer;
  let tempDir: string;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'simplenote-test-'));
  });

  afterEach(async () => {
    // Clean up: stop stores first, then server
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('1: WHEN session 2\'s store is created THEN getState().data.notes.size is 3 before any network wait', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Session 1: Seed server with 3 notes
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'Content 1',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note2',
        data: {
          content: 'Content 2',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note3',
        data: {
          content: 'Content 3',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    // Create session 1 store with sync and FileGhostStore
    const store1 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        ghostStoreProvider: (bucket) => new FileGhostStore(tempDir, bucket.name),
        noteEditDelayMs: 10,
      },
    });

    // Wait for notes to sync
    await waitForNotes(store1, 5000);

    // Save state to disk
    saveState(store1.getState(), tempDir);

    // Stop session 1
    store1.stopSync?.();

    // Clear server received messages to focus on session 2
    server.received = [];

    // Session 2: Create store with preloadedState and same ghost store dir
    const preloadedState = loadState(tempDir);
    const store2 = makeStore({
      preloadedState,
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        ghostStoreProvider: (bucket) => new FileGhostStore(tempDir, bucket.name),
        noteEditDelayMs: 10,
      },
    });

    // Check state BEFORE any network wait
    const state2 = store2.getState();
    expect(state2.data.notes.size).toBe(3);
  });

  it('2: WHEN session 2 has connected THEN server.received for note bucket\'s channel contains a ":cv:" message and no ":i:" message after session 2 started', async () => {
    const appId = 'test-app';
    const token = 'test-token';
    const username = 'test@example.com';
    const now = Date.now();

    // Session 1: Seed server with 3 notes
    server.seedBucket(appId, 'note', [
      {
        id: 'note1',
        data: {
          content: 'Content 1',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note2',
        data: {
          content: 'Content 2',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note3',
        data: {
          content: 'Content 3',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    // Create session 1 store with sync and FileGhostStore
    const store1 = makeStore({
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        ghostStoreProvider: (bucket) => new FileGhostStore(tempDir, bucket.name),
        noteEditDelayMs: 10,
      },
    });

    // Wait for notes to sync
    await waitForNotes(store1, 5000);

    // Save state to disk
    saveState(store1.getState(), tempDir);

    // Stop session 1
    store1.stopSync?.();

    // Clear server received messages to focus on session 2
    server.received = [];

    // Session 2: Create store with preloadedState and same ghost store dir
    const preloadedState = loadState(tempDir);
    const store2 = makeStore({
      preloadedState,
      sync: {
        appId,
        token,
        username,
        clientOptions: { url: server.url },
        ghostStoreProvider: (bucket) => new FileGhostStore(tempDir, bucket.name),
        noteEditDelayMs: 10,
      },
    });

    // Wait for session 2 to connect
    await waitForNotes(store2, 5000);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check that session 2 sent a :cv: message (not :i:) for the note bucket (channel 0)
    const noteChannelMessages = server.received.filter((msg) => msg.startsWith('0:'));
    const hasCvMessage = noteChannelMessages.some((msg) => msg.includes(':cv:'));
    const hasIndexMessage = noteChannelMessages.some((msg) => msg.match(/:i:1/));

    expect(hasCvMessage).toBe(true);
    expect(hasIndexMessage).toBe(false);
  });

});
