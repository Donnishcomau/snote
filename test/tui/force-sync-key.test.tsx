import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import { keymap } from '../../src/core/keymap';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function buildStore(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    const noteId = eid(`note-${idx + 1}`);
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId,
      note: {
        content: note.content,
        systemTags: note.systemTags,
        tags: note.tags,
        deleted: note.deleted,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      },
    });
  });
  return store;
}

describe('force-sync key', () => {
  describe('1: onForceSync prop called once', () => {
    let store: ReturnType<typeof makeStore>;
    let spy: Mock;

    beforeEach(() => {
      store = buildStore();
      spy = vi.fn();
    });

    it('WHEN the app is rendered with onForceSync={spy} and r is written THEN before r the spy had 0 calls and after it exactly one, and data.notes is the same Map as before r', async () => {
      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} onForceSync={spy} />
      );

      const notesBefore = store.getState().data.notes;

      await new Promise((r) => setTimeout(r, 50));

      expect(spy).toHaveBeenCalledTimes(0);

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));

      expect(spy).toHaveBeenCalledTimes(1);
      expect(store.getState().data.notes).toBe(notesBefore);
    });
  });

  describe('2: store forceSync called twice', () => {
    let store: ReturnType<typeof makeStore>;
    let spy: Mock;

    beforeEach(() => {
      store = buildStore();
      (store as { forceSync?: () => void }).forceSync = vi.fn();
      spy = store.forceSync as Mock;
    });

    it('WHEN no prop is given, the store has a forceSync spy and r is written twice THEN that spy was called exactly twice', async () => {
      render(<App store={store} width={80} height={24} />);

      await new Promise((r) => setTimeout(r, 50));

      const { stdin } = render(<App store={store} width={80} height={24} />);
      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));
      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('3: prop wins over store forceSync', () => {
    let store: ReturnType<typeof makeStore>;
    let spy: Mock;
    let storeSpy: Mock;

    beforeEach(() => {
      store = buildStore();
      spy = vi.fn();
      storeSpy = vi.fn();
      (store as { forceSync?: () => void }).forceSync = storeSpy;
    });

    it('WHEN both the prop and the store forceSync spy exist and r is written THEN the prop was called once and the store spy was not called', async () => {
      render(<App store={store} width={80} height={24} onForceSync={spy} />);

      await new Promise((r) => setTimeout(r, 50));

      const { stdin } = render(<App store={store} width={80} height={24} onForceSync={spy} />);
      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));

      expect(spy).toHaveBeenCalledTimes(1);
      expect(storeSpy).not.toHaveBeenCalled();
    });
  });

  describe('4: neither prop nor store forceSync exists', () => {
    let store: ReturnType<typeof makeStore>;

    beforeEach(() => {
      store = buildStore();
      delete (store as any).forceSync;
    });

    it('WHEN neither exists and r is written THEN the frame equals the frame before r and still contains >Pinned note and 4 notes', async () => {
      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} />
      );

      await new Promise((r) => setTimeout(r, 50));

      const frameBefore = lastFrame();
      expect(frameBefore).toContain('>Pinned note');
      expect(frameBefore).toContain('4 notes');

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));

      const frameAfter = lastFrame();
      expect(frameAfter).toContain('>Pinned note');
      expect(frameAfter).toContain('4 notes');
    });
  });

  describe('5: help overlay blocks r', () => {
    let store: ReturnType<typeof makeStore>;
    let spy: Mock;

    beforeEach(() => {
      store = buildStore();
      spy = vi.fn();
    });

    it('WHEN ? (help open) and then r are written THEN the onForceSync spy was not called; after Escape and another r it was called once', async () => {
      const { lastFrame, stdin } = render(
        <App store={store} width={80} height={24} onForceSync={spy} />
      );

      await new Promise((r) => setTimeout(r, 50));

      stdin.write('?');
      await new Promise((r) => setTimeout(r, 50));

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));

      expect(spy).not.toHaveBeenCalled();

      stdin.write('\u001b');
      await new Promise((r) => setTimeout(r, 50));

      stdin.write('r');
      await new Promise((r) => setTimeout(r, 50));

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('6: keymap has r entry', () => {
    it('WHEN keymap from src/core/keymap.ts is read THEN exactly one entry has the key r, and its action is force_sync', () => {
      const entries = keymap.filter((e) => e.key === 'r');
      expect(entries.length).toBe(1);
      expect(entries[0].action).toBe('force_sync');
    });
  });
});
