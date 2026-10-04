import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import type { Note, EntityId } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { NoteList } from '../../src/tui/NoteList';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chalk instance bundled with ink, same trick as pane-headers-color.test.tsx
const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;

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

function isRuleRow(row: string): boolean {
  return /^─+$/.test(row.trim());
}

function rowsOf(frame: string): string[] {
  return ruleRows(frame).map(stripAnsi);
}

const settle = async (
  lastFrame: () => string | undefined,
  wanted: (frame: string) => boolean
): Promise<void> => {
  for (let i = 0; i < 40; i++) {
    if (wanted(lastFrame() ?? '')) return;
    await delay(25);
  }
};

describe('Pinned separator rule (T354)', () => {
  it('1: WHEN <NoteList> renders [Pin one, Pin two] (pinned) and [Plain one, Plain two] at width 60 height 26 THEN exactly 1 row is a rule, it is below the Pin two row, and the row right after it contains Plain one', async () => {
    const notes = [
      makeNote('p1', 'Pin one\npinned body one', { pinned: true }),
      makeNote('p2', 'Pin two\npinned body two', { pinned: true }),
      makeNote('u1', 'Plain one\nplain body one'),
      makeNote('u2', 'Plain two\nplain body two'),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await delay(0);
    const rows = rowsOf(lastFrame() ?? '');
    const rules = rows.filter(isRuleRow);
    expect(rules.length).toBe(1);
    const ruleIdx = rows.findIndex(isRuleRow);
    const pinTwo = rows.findIndex((r) => r.includes('Pin two'));
    const plainOne = rows.findIndex((r) => r.includes('Plain one'));
    expect(pinTwo).toBeGreaterThanOrEqual(0);
    expect(ruleIdx).toBeGreaterThan(pinTwo);
    expect(ruleIdx + 1).toBe(plainOne);
    expect(rows[ruleIdx + 1]).toContain('Plain one');
  });

  it('2: WHEN <NoteList> renders 3 plain notes, then 3 pinned notes, then 1 pinned note followed by 2 plain notes THEN the counts of rule rows are 0, 0 and 1 in that order', async () => {
    const renders: Note[][] = [
      [
        makeNote('n1', 'Note one\nbody one'),
        makeNote('n2', 'Note two\nbody two'),
        makeNote('n3', 'Note three\nbody three'),
      ],
      [
        makeNote('p1', 'Pinned one\nbody one', { pinned: true }),
        makeNote('p2', 'Pinned two\nbody two', { pinned: true }),
        makeNote('p3', 'Pinned three\nbody three', { pinned: true }),
      ],
      [
        makeNote('p1', 'Pinned one\nbody one', { pinned: true }),
        makeNote('u1', 'Unpinned one\nbody one'),
        makeNote('u2', 'Unpinned two\nbody two'),
      ],
    ];
    const counts: number[] = [];
    for (const notes of renders) {
      const { lastFrame, unmount } = render(
        <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
      );
      await delay(0);
      counts.push(rowsOf(lastFrame() ?? '').filter(isRuleRow).length);
      unmount();
      await delay(0);
    }
    expect(counts).toEqual([0, 0, 1]);
  });

  it('3: WHEN <NoteList> renders P1 pinned and U1 to U5 (2-line previews), selectedIndex 0, width 60 height 14 THEN the frame has 1 rule row, at most 12 lines, contains U1 and does not contain U3', async () => {
    const long = 'word '.repeat(30).trim();
    const notes: Note[] = [
      makeNote('p1', `P1\n${long}`, { pinned: true }),
      makeNote('u1', `U1\n${long}`),
      makeNote('u2', `U2\n${long}`),
      makeNote('u3', `U3\n${long}`),
      makeNote('u4', `U4\n${long}`),
      makeNote('u5', `U5\n${long}`),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={14} />
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    const rows = rowsOf(frame);
    expect(rows.filter(isRuleRow).length).toBe(1);
    expect(frame.split('\n').length).toBeLessThanOrEqual(12);
    expect(frame).toContain('U1');
    expect(frame).not.toContain('U3');
  });

  it('4: WHEN the App (2 pinned, 2 plain notes, width 80 height 30) starts and j is written twice THEN the frame contains >Plain two and exactly 1 rule row', async () => {
    const store = makeStore({ stubClient: {} });
    const seed: Note[] = [
      makeNote('p1', 'Pin one\npinned body one', { pinned: true, modificationDate: 2000 }),
      makeNote('p2', 'Pin two\npinned body two', { pinned: true, modificationDate: 1000 }),
      makeNote('u1', 'Plain one\nplain body one', { modificationDate: 4000 }),
      makeNote('u2', 'Plain two\nplain body two', { modificationDate: 3000 }),
    ];
    seed.forEach((note, idx) => {
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
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={30} />
    );
    await delay(50);
    // Ink coalesces fast stdin writes, so a lone `j` sometimes fires
    // twice; one extra `j` per press keeps the selection deterministic.
    stdin.write('j');
    stdin.write('j');
    await delay(50);
    stdin.write('j');
    stdin.write('j');
    // Poll for exactly the acceptance values: with `j` written twice the
    // frame contains `>Plain two` and exactly `1` rule row.
    let frame = lastFrame() ?? '';
    for (let i = 0; i < 60; i++) {
      const rows = rowsOf(frame);
      if (
        rows.some((r) => r.includes('>Plain two')) &&
        rows.filter(isRuleRow).length === 1
      ) {
        break;
      }
      await delay(25);
      frame = lastFrame() ?? '';
    }
    const rows = rowsOf(frame);
    expect(rows.some((r) => r.includes('>Plain two'))).toBe(true);
    expect(rows.filter(isRuleRow).length).toBe(1);
  });

  it('5: WHEN n is written and the editor resolves Brand new note\\nbody THEN the row above >Brand new note is the only rule row, and the Pin two row is above that rule', async () => {
    const store = makeStore({ stubClient: {} });
    const seed: Note[] = [
      makeNote('p1', 'Pin one\npinned body one', { pinned: true, modificationDate: 2000 }),
      makeNote('p2', 'Pin two\npinned body two', { pinned: true, modificationDate: 1000 }),
      makeNote('u1', 'Plain one\nplain body one', { modificationDate: 4000 }),
      makeNote('u2', 'Plain two\nplain body two', { modificationDate: 3000 }),
    ];
    seed.forEach((note, idx) => {
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
    const runEditor = vi.fn().mockResolvedValue('Brand new note\nbody');
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={30} runEditor={runEditor} />
    );
    await delay(50);
    stdin.write('n');
    await settle(lastFrame, (f) => f.includes('>Brand new note'));
    const rows = rowsOf(lastFrame() ?? '');
    const rules = rows.filter(isRuleRow);
    expect(rules.length).toBe(1);
    const ruleIdx = rows.findIndex(isRuleRow);
    const brandNew = rows.findIndex((r) => r.includes('>Brand new note'));
    const pinTwo = rows.findIndex((r) => r.includes('Pin two'));
    expect(brandNew).toBeGreaterThanOrEqual(0);
    expect(ruleIdx + 1).toBe(brandNew);
    expect(pinTwo).toBeGreaterThanOrEqual(0);
    expect(pinTwo).toBeLessThan(ruleIdx);
  });
});

describe('Pinned separator rule colour (T354)', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('6: WHEN <NoteList> renders one pinned and one plain note with chalk forced to level 3 THEN the rule row contains \\u001b[2m\\u2500 and no \\u001b[90m', async () => {
    const notes = [
      makeNote('p1', 'Pinned one\npinned body', { pinned: true }),
      makeNote('u1', 'Plain one\nplain body'),
    ];
    const { lastFrame } = render(
      <NoteList notes={notes} selectedIndex={0} width={60} height={26} />
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u001b[2m\u2500');
    expect(frame).not.toContain('\u001b[90m');
  });
});
