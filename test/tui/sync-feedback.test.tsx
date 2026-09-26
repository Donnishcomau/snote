import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function buildStoreWithTwoNotes(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  const notes = [
    { content: 'Note one', systemTags: [] as const, tags: [] as string[] },
    { content: 'Note two', systemTags: [] as const, tags: [] as string[] },
  ];
  notes.forEach((note, idx) => {
    const noteId = eid(`note-${idx + 1}`);
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: note as never,
    });
  });
  return store;
}

describe('T212 The r key says it synced', () => {
  describe('1: WHEN r is written THEN spy was called 1 time and the frame contains synced followed by a time', () => {
    it('WHEN r is written THEN spy was called 1 time and the frame contains `synced ` followed by a time matching /\\d\\d:\\d\\d/', async () => {
      const store = buildStoreWithTwoNotes();
      const spy = vi.fn();

      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} onForceSync={spy} />
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(spy).toHaveBeenCalledTimes(0);

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 300));

      expect(spy).toHaveBeenCalledTimes(1);
      const frame = lastFrame() ?? '';
      expect(frame).toMatch(/synced \d\d:\d\d/);
    });
  });

  describe('2: WHEN r is written and 3100 ms pass THEN the frame no longer contains synced and still contains 2 notes', () => {
    it('WHEN r is written and 3100 ms pass THEN the frame no longer contains `synced ` and still contains `2 notes`', { timeout: 6000 }, async () => {
      const store = buildStoreWithTwoNotes();
      const spy = vi.fn();

      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} onForceSync={spy} />
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 3100));

      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('synced ');
      expect(frame).toContain('2 notes');
    });
  });

  describe('3: WHEN r is written twice with 100 ms between them THEN spy was called 2 times and the frame contains synced exactly once', () => {
    it('WHEN r is written twice with 100 ms between them THEN spy was called 2 times and the frame contains `synced ` exactly once', async () => {
      const store = buildStoreWithTwoNotes();
      const spy = vi.fn();

      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} onForceSync={spy} />
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 100));
      stdin.write('r');
      await new Promise((r) => setTimeout(r, 300));

      expect(spy).toHaveBeenCalledTimes(2);
      const frame = lastFrame() ?? '';
      const matches = frame.match(/synced /g);
      expect(matches?.length).toBe(1);
    });
  });

  describe('4: WHEN no key is written THEN the frame does not contain synced and contains 2 notes', () => {
    it('WHEN no key is written THEN the frame does not contain `synced ` and contains `2 notes`', async () => {
      const store = buildStoreWithTwoNotes();
      const spy = vi.fn();

      const { lastFrame } = render(
        <App store={store} width={80} height={24} onForceSync={spy} />
      );

      await new Promise((r) => setTimeout(r, 50));

      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('synced ');
      expect(frame).toContain('2 notes');
    });
  });

  describe('5: WHEN r is written on an App rendered WITHOUT onForceSync and with a store that has no forceSync THEN nothing throws and the frame still contains 2 notes', () => {
    it('WHEN r is written on an App rendered WITHOUT onForceSync and with a store that has no forceSync THEN nothing throws and the frame still contains `2 notes`', async () => {
      const store = buildStoreWithTwoNotes();
      delete (store as any).forceSync;

      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} />
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 300));

      const frame = lastFrame() ?? '';
      expect(frame).toContain('2 notes');
    });
  });
});
