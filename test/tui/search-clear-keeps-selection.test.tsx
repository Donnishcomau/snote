/**
 * T300: clearing a search with Escape keeps the note you just found.
 * Verifies both Escape paths (inside the search prompt, and with the
 * query applied after Enter) reselect the remembered note by id.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { readFileSync } from 'node:fs';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

// Four notes; `Gamma target` is NOT first in the unfiltered list
// (sorted: Alpha pinned, then Delta, Gamma, Beta by modificationDate desc).
const notes = [
  { id: 'note-alpha', content: 'Alpha note\npinned one', pinned: true, mod: 1000 },
  { id: 'note-beta', content: 'Beta note\nbeta body', pinned: false, mod: 4000 },
  { id: 'note-gamma', content: 'Gamma target\ngamma body', pinned: false, mod: 3000 },
  { id: 'note-delta', content: 'Delta note\ndelta body', pinned: false, mod: 2000 },
];

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe('Search clear keeps selection', () => {
  let store: ReturnType<typeof makeStore>;
  let runEditor: Mock;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    notes.forEach((note) => {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: eid(note.id),
        note: {
          content: note.content,
          systemTags: note.pinned ? (['pinned'] as const) : [],
          tags: [],
          deleted: false,
          modificationDate: note.mod,
          creationDate: note.mod,
        },
      });
    });
    runEditor = vi.fn().mockResolvedValue(null);
  });

  it('1: WHEN /, gamma, Enter, then Escape are written THEN the frame contains >Gamma target and does not contain >Alpha note', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await tick();

    stdin.write('/');
    await tick();
    stdin.write('gamma');
    await tick();
    stdin.write('\r');
    await tick();
    stdin.write('\u001b');
    await tick();

    const frame = lastFrame();
    expect(frame).toContain('>Gamma target');
    expect(frame).not.toContain('>Alpha note');
  });

  it('2: WHEN /, gamma, then Escape (without Enter) are written THEN the frame contains >Gamma target', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await tick();

    stdin.write('/');
    await tick();
    stdin.write('gamma');
    await tick();
    stdin.write('\u001b');
    await tick();

    const frame = lastFrame();
    expect(frame).toContain('>Gamma target');
  });

  it('3: WHEN /, gamma, Enter, Escape, then e are written with a spy runEditor THEN the spy was called once with content starting Gamma target', async () => {
    const { stdin } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await tick();

    stdin.write('/');
    await tick();
    stdin.write('gamma');
    await tick();
    stdin.write('\r');
    await tick();
    stdin.write('\u001b');
    await tick();
    stdin.write('e');
    await tick(100);

    expect(runEditor).toHaveBeenCalledTimes(1);
    expect(String(runEditor.mock.calls[0][0])).toMatch(/^Gamma target/);
  });

  it('4: WHEN /, zzz (no matches), then Escape are written THEN the frame\'s selected row is the first note of the full list', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await tick();

    stdin.write('/');
    await tick();
    stdin.write('zzz');
    await tick();
    stdin.write('\u001b');
    await tick();

    const selectedRow = (lastFrame() ?? '').split('\n').find((l) => l.startsWith('>'));
    expect(selectedRow).toContain('Alpha note');
  });

  it('5: WHEN src/tui/App.tsx is read as text THEN it has fewer than 250 lines', () => {
    const text = readFileSync('src/tui/App.tsx', 'utf8');
    expect(text.split('\n').length).toBeLessThan(250);
  });
});
