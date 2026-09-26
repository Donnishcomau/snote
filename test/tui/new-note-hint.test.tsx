import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const tick = async (ms: number) => {
  await new Promise((r) => setTimeout(r, ms));
};

const settle = async (
  lastFrame: () => string | undefined,
  wanted: (frame: string) => boolean
): Promise<void> => {
  for (let i = 0; i < 40; i++) {
    const frame = lastFrame() ?? '';
    if (wanted(frame)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('New note hint after creation', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed notes in the store
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
  });

  it('1: WHEN n is written and runEditor resolves "Brand new note\\nbody" THEN the frame contains New note saved — press g to add tags', async () => {
    const runEditor = vi.fn().mockResolvedValue('Brand new note\nbody');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('New note saved — press g to add tags'));

    const frame = lastFrame() ?? '';
    expect(frame).toContain('New note saved — press g to add tags');
  });

  it('2: WHEN, after line 1\'s hint is showing, j is written THEN the frame no longer contains New note saved — press g to add tags', async () => {
    const runEditor = vi.fn().mockResolvedValue('Brand new note\nbody');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('New note saved — press g to add tags'));

    // Now press j to move selection
    stdin.write('j');
    await tick(50);

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('New note saved — press g to add tags');
  });

  it('3: WHEN n is written and runEditor resolves null (cancelled) THEN the frame never contains New note saved — press g to add tags, and 4 notes still shows', async () => {
    const runEditor = vi.fn().mockResolvedValue(null);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('n');
    await settle(lastFrame, () => runEditor.mock.calls.length === 1);
    await tick(50);

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('New note saved — press g to add tags');
    expect(frame).toContain('4 notes');
  });

  it('4: WHEN e is written on the selected existing note (runEditor resolves "Edited text") THEN the frame does not contain New note saved — press g to add tags at any point', async () => {
    const runEditor = vi.fn().mockResolvedValue('Edited text');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('e');
    await settle(lastFrame, () => runEditor.mock.calls.length === 1);
    await tick(50);

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('New note saved — press g to add tags');
  });

  it('5: WHEN, after line 1\'s hint is showing, 200ms pass with no key pressed THEN the frame still contains New note saved — press g to add tags; WHEN g is then written THEN the frame no longer contains it', async () => {
    const runEditor = vi.fn().mockResolvedValue('Brand new note\nbody');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );

    await tick(50);

    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('New note saved — press g to add tags'));

    // Wait 200ms with no key pressed
    await tick(200);

    const frame1 = lastFrame() ?? '';
    expect(frame1).toContain('New note saved — press g to add tags');

    // Now press g
    stdin.write('g');
    await tick(50);

    const frame2 = lastFrame() ?? '';
    expect(frame2).not.toContain('New note saved — press g to add tags');
  });
});
