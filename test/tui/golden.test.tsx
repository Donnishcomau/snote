import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('Golden frames: search, tags, help', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed notes with fixed dates for determinism
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('g1') as never,
      note: makeNote('g1', 'Pinned note\nalpha', { pinned: true, creationDate: 1000, modificationDate: 1000 }),
    });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('g2') as never,
      note: makeNote('g2', 'First normal note\nbeta', { creationDate: 1000, modificationDate: 3000, tags: ['work'] }),
    });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('g3') as never,
      note: makeNote('g3', 'Second normal note\ngamma', { creationDate: 1000, modificationDate: 4000, tags: ['home'] }),
    });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('g4') as never,
      note: makeNote('g4', 'Third thing\ndelta', { creationDate: 1000, modificationDate: 5000 }),
    });
  });

  it('1: WHEN at 80x24 / then normal are written THEN the frame contains search: normal, >Second normal note, First normal note and 2 notes, not Third thing and not Pinned note; snapshot search-80x24', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('/');
    await vi.waitFor(() => expect(lastFrame()).toContain('search'), { timeout: 2000 });
    stdin.write('n');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('o');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('r');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('m');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('a');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('l');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('search: normal');
    expect(frame).toContain('>Second normal note');
    expect(frame).toContain('First normal note');
    expect(frame).toContain('2 notes');
    expect(frame).not.toContain('Third thing');
    expect(frame).not.toContain('Pinned note');
    expect(frame).toMatchSnapshot('search-80x24');
  });

  it('2: WHEN at 120x40 / then normal are written THEN the frame contains search: normal, 2 notes and All notes (tags pane open by itself at this width), not Third thing; snapshot search-120x40', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={120} height={40} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('/');
    await vi.waitFor(() => expect(lastFrame()).toContain('search'), { timeout: 2000 });
    stdin.write('n');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('o');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('r');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('m');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('a');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('l');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('search: normal');
    expect(frame).toContain('2 notes');
    expect(frame).toContain('All notes');
    expect(frame).not.toContain('Third thing');
    expect(frame).toMatchSnapshot('search-120x40');
  });

  it('3: WHEN at 80x24 t then j are written THEN the frame contains Tags, All notes, >home, work, Untagged and still 4 notes (no filter chosen yet); snapshot tags-80x24', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Tags');
    expect(frame).toContain('All notes');
    expect(frame).toContain('>home');
    expect(frame).toContain('work');
    expect(frame).toContain('Untagged');
    expect(frame).toContain('4 notes');
    expect(frame).toMatchSnapshot('tags-80x24');
  });

  it('4: WHEN at 120x40 t then j are written THEN the frame contains >home, Notes, Preview and 4 notes; snapshot tags-120x40', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={120} height={40} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('t');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('j');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('>home');
    expect(frame).toContain('Notes');
    expect(frame).toContain('Preview');
    expect(frame).toContain('4 notes');
    expect(frame).toMatchSnapshot('tags-120x40');
  });

  it('5: WHEN at 80x24 ? is written THEN the frame contains Help - Keyboard Shortcuts, Move down, Search notes and Show / focus the tags pane, not Pinned note, and has at most 24 lines; snapshot help-80x24', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('?');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Help - Keyboard Shortcuts');
    expect(frame).toContain('Move down');
    expect(frame).toContain('Search notes');
    expect(frame).toContain('Show / focus the tags pane');
    expect(frame).not.toContain('Pinned note');
    const lines = frame.split('\n');
    expect(lines.length).toBeLessThanOrEqual(24);
    expect(frame).toMatchSnapshot('help-80x24');
  });

  it('6: WHEN at 120x40 ? is written THEN the frame contains Help - Keyboard Shortcuts and Search notes and has at most 40 lines; snapshot help-120x40', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={120} height={40} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('?');
    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('Help - Keyboard Shortcuts');
    expect(frame).toContain('Search notes');
    const lines = frame.split('\n');
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(frame).toMatchSnapshot('help-120x40');
  });
});
