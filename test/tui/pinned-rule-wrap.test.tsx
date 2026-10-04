import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';
import React from 'react';

import type { EntityId } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { NoteList } from '../../src/tui/NoteList';
import { makeNote, testNotes } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// Ink's truncate wrap paints a trailing `…`; it is not part of the rule.
function dropEllipsis(row: string): string {
  return row.replace(/…+$/, '');
}

// In App frames a row may contain pane borders; cut at the first border char.
function ruleRows(frame: string): string[] {
  return frame
    .split('\n')
    .map((l) => (l.includes('│') ? l.slice(0, l.indexOf('│')) : l));
}

function isRuleRow(row: string): boolean {
  return /^─+$/.test(dropEllipsis(row.trim()));
}

function rowsOf(frame: string): string[] {
  return ruleRows(frame).map(stripAnsi);
}

describe('Pinned rule truncation (T365)', () => {
  it('1: WHEN the App with testNotes renders at width 120 height 40 THEN exactly 1 row is a rule row, and the row right after it contains Third normal note', async () => {
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
    const { lastFrame } = render(<App store={store} width={120} height={40} />);
    // Poll until exactly the acceptance values hold: `1` rule row and the
    // row after it contains `Third normal note`.
    let frame = lastFrame() ?? '';
    for (let i = 0; i < 60; i++) {
      const rows = rowsOf(frame);
      const ruleIdx = rows.findIndex(isRuleRow);
      if (
        rows.filter(isRuleRow).length === 1 &&
        ruleIdx >= 0 &&
        (rows[ruleIdx + 1] ?? '').includes('Third normal note')
      ) {
        break;
      }
      await delay(25);
      frame = lastFrame() ?? '';
    }
    const rows = rowsOf(frame);
    expect(rows.filter(isRuleRow).length).toBe(1);
    const ruleIdx = rows.findIndex(isRuleRow);
    expect(rows[ruleIdx + 1]).toContain('Third normal note');
  });

  it('2: WHEN <NoteList> renders one pinned note Pin one and one plain note Plain one with width={120} inside a <Box width={40}> THEN exactly 1 rule row appears and the row after it contains Plain one', async () => {
    const notes = [
      makeNote('p1', 'Pin one\npinned body one', { pinned: true }),
      makeNote('u1', 'Plain one\nplain body one'),
    ];
    const { lastFrame } = render(
      <Box width={40}>
        <NoteList notes={notes} selectedIndex={0} width={120} height={26} />
      </Box>,
    );
    await delay(0);
    const rows = rowsOf(lastFrame() ?? '');
    expect(rows.filter(isRuleRow).length).toBe(1);
    const ruleIdx = rows.findIndex(isRuleRow);
    expect(rows[ruleIdx + 1]).toContain('Plain one');
  });

  it('3: WHEN src/tui/NoteList.tsx is read THEN the line holding rule- contains wrap="truncate"', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(here, '../../src/tui/NoteList.tsx'),
      'utf8',
    );
    const ruleLine = source.split('\n').find((l) => l.includes('rule-'));
    expect(ruleLine).toContain('wrap="truncate"');
  });
});
