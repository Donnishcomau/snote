import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import type { Note, EntityId } from '@vendor/types';
import { noteRow } from '../../src/core/note-row';
import { makeStore } from '../../src/core/store';
import { NoteList } from '../../src/tui/NoteList';
import { App } from '../../src/tui/App';
import { makeNote, testNotes } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// In App frames a row may contain pane borders; cut at the first border char.
function ruleRows(frame: string): string[] {
  return frame
    .split('\n')
    .map((l) => (l.includes('│') ? l.slice(0, l.indexOf('│')) : l));
}

// A rule row is a row whose text before the first `│` is only `─` characters.
function isRuleRow(row: string): boolean {
  return /^─+$/.test(row.trim());
}

function rowsOf(frame: string): string[] {
  return ruleRows(frame).map(stripAnsi);
}

function note(content: string, systemTags: Note['systemTags'] = []): Note {
  return {
    content,
    systemTags,
    creationDate: 0,
    modificationDate: 0,
    deleted: false,
    tags: [],
  };
}

function seedStore(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx + 1}`),
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

describe('Pinned notes lose the trailing marker (T355)', () => {
  it('1: WHEN noteRow is called for a pinned note with content "Pinned note\\nbody" at width 30 THEN marker is "" and title is "Pinned note"', () => {
    const n = note('Pinned note\nbody', ['pinned']);
    const row = noteRow(n, 30);
    expect(row.marker).toBe('');
    expect(row.title).toBe('Pinned note');
  });

  it('2: WHEN <NoteList> renders a pinned note "Pin one" with selectedIndex 0 at width 60 THEN the stripped row holding "Pin one" is exactly ">Pin one" and the frame does not contain " *"', async () => {
    const notes = [makeNote('p1', 'Pin one\npinned body', { pinned: true })];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    const rows = rowsOf(frame);
    const pinRow = rows.find((r) => r.includes('Pin one'));
    expect(pinRow).toBe('>Pin one');
    expect(frame).not.toContain(' *');
  });

  it('3: WHEN the App (testNotes, width 80 height 24) starts THEN the frame contains ">Pinned note", does not contain "Pinned note *", and has exactly 1 rule row', async () => {
    const store = seedStore();
    const { lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    let frame = lastFrame() ?? '';
    // Poll for exactly the acceptance values
    for (let i = 0; i < 60; i++) {
      const rows = rowsOf(frame);
      if (
        frame.includes('>Pinned note') &&
        !frame.includes('Pinned note *') &&
        rows.filter(isRuleRow).length === 1
      ) {
        break;
      }
      await delay(25);
      frame = lastFrame() ?? '';
    }
    const rows = rowsOf(frame);
    expect(frame).toContain('>Pinned note');
    expect(frame).not.toContain('Pinned note *');
    expect(rows.filter(isRuleRow).length).toBe(1);
  });

  it('4: WHEN j then p are written THEN the frame does not contain "Third normal note *", note-5 has pinned in systemTags, and the rule row is below the Third normal note row and the Pinned note row', async () => {
    const store = seedStore();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );
    await delay(50);

    // j: move down to Third normal note (second item), then p: pin note-5
    stdin.write('j');
    await delay(50);
    stdin.write('p');
    await delay(50);

    let frame = lastFrame() ?? '';
    // Poll for exactly the acceptance values
    for (let i = 0; i < 60; i++) {
      const rows = rowsOf(frame);
      const ruleIdx = rows.findIndex(isRuleRow);
      const thirdIdx = rows.findIndex((r) => r.includes('Third normal note'));
      const pinnedIdx = rows.findIndex((r) => r.includes('Pinned note'));
      if (
        !frame.includes('Third normal note *') &&
        ruleIdx >= 0 &&
        thirdIdx >= 0 &&
        pinnedIdx >= 0 &&
        ruleIdx > thirdIdx &&
        ruleIdx > pinnedIdx
      ) {
        break;
      }
      await delay(25);
      frame = lastFrame() ?? '';
    }

    const rows = rowsOf(frame);
    const ruleIdx = rows.findIndex(isRuleRow);
    const thirdIdx = rows.findIndex((r) => r.includes('Third normal note'));
    const pinnedIdx = rows.findIndex((r) => r.includes('Pinned note'));
    expect(frame).not.toContain('Third normal note *');
    const note5 = store.getState().data.notes.get('note-5' as never);
    expect(note5?.systemTags.includes('pinned')).toBe(true);
    expect(thirdIdx).toBeGreaterThanOrEqual(0);
    expect(pinnedIdx).toBeGreaterThanOrEqual(0);
    expect(ruleIdx).toBeGreaterThan(thirdIdx);
    expect(ruleIdx).toBeGreaterThan(pinnedIdx);
  });
});
