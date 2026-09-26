import { describe, it, expect } from 'vitest';
import { makeStore, waitForNotes, type SyncConfig } from '../../src/core/store';

describe('store with sync middleware', () => {
  it('creates store without sync middleware when no sync config', () => {
    const store = makeStore();
    const state = store.getState();

    // OMARCHY: T82 adds fields to the simperium state; assert keys, not exact shape
    expect(state.simperium).toMatchObject({
      connected: false,
      syncing: false,
      ghosts: [new Map(), new Map()],
    });
  });

  it('creates store with sync middleware when sync config provided', () => {
    const syncConfig: SyncConfig = {
      appId: 'test-app-id',
      token: 'test-token',
      username: 'test@example.com',
      clientOptions: { url: 'http://localhost:4567' },
    };

    const store = makeStore({ sync: syncConfig });
    const state = store.getState();

    // Store should be created successfully
    expect(state.simperium).toBeDefined();
  });

  it('skips sync middleware when stubClient is provided', () => {
    const syncConfig: SyncConfig = {
      appId: 'test-app-id',
      token: 'test-token',
      username: 'test@example.com',
    };

    const store = makeStore({ sync: syncConfig, stubClient: {} });
    const state = store.getState();

    // OMARCHY: T82 adds fields to the simperium state; assert keys, not exact shape
    expect(state.simperium).toMatchObject({
      connected: false,
      syncing: false,
      ghosts: [new Map(), new Map()],
    });
  });

  it('waitForNotes rejects on timeout', async () => {
    const store = makeStore();

    await expect(waitForNotes(store, 100)).rejects.toThrow('Timeout waiting for notes to load');
  });
});
