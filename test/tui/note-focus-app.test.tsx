import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

// G: the checklist note (newer); P: a plain note with no checklist items (older)
const G = 'Groceries\n- [ ] milk\n- [x] bread';
const P = 'Plain note\nbody text';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clean = (s: string | undefined): string => s ?? '';

function setup() {
  const store = makeStore({ stubClient: {} });
  // Same modificationDate: G first (alphabetical on id), P second
  const ts = 1_700_000_000;
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('g'),
    note: makeNote('g', G, { modificationDate: ts, creationDate: ts }) as never,
  });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('p'),
    note: makeNote('p', P, { modificationDate: ts, creationDate: ts }) as never,
  });
  return store;
}

describe('note-focus-app', () => {
  it('1: WHEN the app renders with G selected and c is pressed before any Tab THEN the frame does not contain "│>" and data.notes is the same Map as before (toBe)', async () => {
    const store = setup();
    const before = store.getState().data.notes;
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    expect(clean(lastFrame())).toContain('Preview: Groceries');
    stdin.write('c');
    await delay(50);
    // The frame has no gutter cursor and the note content was not toggled.
    expect(clean(lastFrame())).not.toContain('│>');
    expect(store.getState().data.notes.get(eid('g'))?.content).toBe(G);
    expect(store.getState().data.notes).toBe(before);
  });

  it('2: WHEN Tab is pressed THEN the frame contains "│>- [ ] milk" and does not contain "│>- [x] bread"', async () => {
    const store = setup();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    const frame = clean(lastFrame());
    expect(frame).toContain('│>- [ ] milk');
    expect(frame).not.toContain('│>- [x] bread');
  });

  it('3: WHEN Tab then j are pressed THEN the frame contains "│>- [x] bread" and not "│>- [ ] milk"; WHEN k is pressed next THEN the frame contains "│>- [ ] milk" again', async () => {
    const store = setup();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('j');
    await delay(50);
    let frame = clean(lastFrame());
    expect(frame).toContain('│>- [x] bread');
    expect(frame).not.toContain('│>- [ ] milk');
    stdin.write('k');
    await delay(50);
    frame = clean(lastFrame());
    expect(frame).toContain('│>- [ ] milk');
  });

  it("4: WHEN Tab then c are pressed (cursor on milk) THEN the note's content in data.notes becomes 'Groceries\\n- [x] milk\\n- [x] bread' and the frame contains \"│>- [x] milk\"", async () => {
    const store = setup();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('c');
    await delay(50);
    expect(store.getState().data.notes.get(eid('g'))?.content).toBe('Groceries\n- [x] milk\n- [x] bread');
    expect(clean(lastFrame())).toContain('│>- [x] milk');
  });

  it('5: WHEN Tab then Escape are pressed THEN the frame contains no "│>"; pressing j next moves the frame\'s Preview: line from Groceries to Plain note', async () => {
    const store = setup();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('\x1b');
    await delay(50);
    expect(clean(lastFrame())).not.toContain('│>');
    stdin.write('j');
    await delay(50);
    const frame = clean(lastFrame());
    expect(frame).toContain('Preview: Plain note');
    expect(frame).not.toContain('Preview: Groceries');
  });

  it('6: WHEN j (select P, no checklist items) then Tab then j are pressed THEN the frame never contains "│>" and the frame\'s Preview: line still reads Plain note', async () => {
    const store = setup();
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('j');
    await delay(50);
    expect(clean(lastFrame())).toContain('Preview: Plain note');
    stdin.write('\t');
    await delay(50);
    expect(clean(lastFrame())).not.toContain('│>');
    stdin.write('j');
    await delay(50);
    expect(clean(lastFrame())).not.toContain('│>');
    expect(clean(lastFrame())).toContain('Preview: Plain note');
  });
});
