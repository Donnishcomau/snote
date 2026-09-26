import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// Fixture: three notes, l1 newest first. l1 has tag 'work'.
function seed(store: ReturnType<typeof makeStore>) {
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('l1'),
    note: makeNote('l1', 'Alpha note\nalpha body', { tags: ['work'], creationDate: 1000, modificationDate: 3000 }),
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('l2'),
    note: makeNote('l2', 'Beta note\nbeta body', { tags: [], creationDate: 1000, modificationDate: 2000 }),
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('l3'),
    note: makeNote('l3', 'Gamma note\ngamma body', { tags: [], creationDate: 1000, modificationDate: 1000 }),
  });
}

describe('T153 Read a note on a narrow terminal', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    seed(store);
  });

  it("1: WHEN at width 40 '\\r' is written THEN before it the frame matches /^Notes/m and has no Preview:; after it the frame contains Preview: Alpha note and alpha body, does not match /^Notes/m, and no frame line is longer than 40 characters", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={40} height={24} />);
    await delay(50);

    const before = stripAnsi(lastFrame() ?? '');
    expect(before).toMatch(/^Notes/m);
    expect(before).not.toContain('Preview:');

    stdin.write('\r');
    await delay(50);

    const after = stripAnsi(lastFrame() ?? '');
    expect(after).toContain('Preview: Alpha note');
    expect(after).toContain('alpha body');
    expect(after).not.toMatch(/^Notes/m);
    for (const line of after.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("2: WHEN at width 40 '\\r' then 'j' are written THEN the frame contains Preview: Beta note and not Preview: Alpha note", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={40} height={24} />);
    await delay(50);

    stdin.write('\r');
    await delay(50);
    stdin.write('j');
    await delay(50);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Preview: Beta note');
    expect(frame).not.toContain('Preview: Alpha note');
  });

  it("3: WHEN at width 40 '\\r' then '\\u001b' are written THEN the frame matches /^Notes/m, contains >Alpha note and has no Preview:; WHEN '\\r' is written twice instead THEN the same holds", async () => {
    const esc = render(<App store={store} width={40} height={24} />);
    await delay(50);
    esc.stdin.write('\r');
    await delay(50);
    esc.stdin.write('\u001b');
    await delay(50);
    const escFrame = stripAnsi(esc.lastFrame() ?? '');
    expect(escFrame).toMatch(/^Notes/m);
    expect(escFrame).toContain('>Alpha note');
    expect(escFrame).not.toContain('Preview:');

    const enter = render(<App store={store} width={40} height={24} />);
    await delay(50);
    enter.stdin.write('\r');
    await delay(50);
    enter.stdin.write('\r');
    await delay(50);
    const enterFrame = stripAnsi(enter.lastFrame() ?? '');
    expect(enterFrame).toMatch(/^Notes/m);
    expect(enterFrame).toContain('>Alpha note');
    expect(enterFrame).not.toContain('Preview:');
  });

  it("4: WHEN at width 40 '\\r', 't', then '\\u001b' are written THEN after 't' the frame contains All notes and no Preview:; after Escape it contains Preview: Alpha note again; WHEN then 'q' is written THEN onQuit was called 1 time", async () => {
    const onQuit = vi.fn();
    const { stdin, lastFrame } = render(<App store={store} width={40} height={24} onQuit={onQuit} />);
    await delay(50);

    stdin.write('\r');
    await delay(50);
    stdin.write('t');
    await delay(50);
    const afterT = stripAnsi(lastFrame() ?? '');
    expect(afterT).toContain('All notes');
    expect(afterT).not.toContain('Preview:');

    stdin.write('\u001b');
    await delay(50);
    const afterEsc = stripAnsi(lastFrame() ?? '');
    expect(afterEsc).toContain('Preview: Alpha note');

    stdin.write('q');
    await delay(50);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("5: WHEN at width 80 '\\r' is written THEN the frame still matches /^Notes/m AND contains Preview: Alpha note", async () => {
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);

    stdin.write('\r');
    await delay(50);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toMatch(/^Notes/m);
    expect(frame).toContain('Preview: Alpha note');
  });

  it('6: WHEN src/tui/MainPanes.tsx and src/tui/App.tsx are read THEN MainPanes.tsx contains <Preview exactly 1 time and <NoteList exactly 1 time, and App.tsx has fewer than 250 lines', () => {
    const panes = read('src/tui/MainPanes.tsx');
    const app = read('src/tui/App.tsx');
    expect(panes.match(/<Preview/g)).toHaveLength(1);
    expect(panes.match(/<NoteList/g)).toHaveLength(1);
    expect(app.split('\n').length).toBeLessThan(250);
  });
});
