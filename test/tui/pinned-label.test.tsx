import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import type { EntityId } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { NoteList } from '../../src/tui/NoteList';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// Rows of the list column only (App frames carry the pane border).
function rowsOf(frame: string): string[] {
  return strip(frame)
    .split('\n')
    .map((l) => (l.includes('│') ? l.slice(0, l.indexOf('│')) : l).trimEnd());
}

const isRule = (r: string): boolean => /^─+$/.test(r.trim());

const pin = (id: string, text: string) => makeNote(id, text, { pinned: true });

describe('Pinned label row (#71)', () => {
  it('1: WHEN 2 pinned and 2 unpinned notes are listed THEN a row `Pinned` appears once, above the first pinned note, and the existing rule row stays between the groups', () => {
    const notes = [
      pin('p1', 'Pin one\nbody'),
      pin('p2', 'Pin two\nbody'),
      makeNote('u1', 'Plain one\nbody'),
      makeNote('u2', 'Plain two\nbody'),
    ];
    const { lastFrame } = render(<NoteList notes={notes} selectedIndex={0} width={60} height={30} />);
    const rows = rowsOf(lastFrame() ?? '');
    const labels = rows.filter((r) => r.trim() === 'Pinned');
    expect(labels.length).toBe(1);
    const at = rows.findIndex((r) => r.trim() === 'Pinned');
    const first = rows.findIndex((r) => r.includes('Pin one'));
    const second = rows.findIndex((r) => r.includes('Pin two'));
    const plain = rows.findIndex((r) => r.includes('Plain one'));
    expect(first).toBe(at + 1);
    expect(rows.filter(isRule).length).toBe(1);
    const rule = rows.findIndex(isRule);
    expect(rule).toBeGreaterThan(second);
    expect(rule).toBeLessThan(plain);
  });

  it('2: WHEN all notes are pinned THEN the `Pinned` row appears and no rule row appears', () => {
    const notes = [pin('p1', 'Pin one\nbody'), pin('p2', 'Pin two\nbody')];
    const { lastFrame } = render(<NoteList notes={notes} selectedIndex={0} width={60} height={30} />);
    const rows = rowsOf(lastFrame() ?? '');
    expect(rows.filter((r) => r.trim() === 'Pinned').length).toBe(1);
    expect(rows.filter(isRule).length).toBe(0);
  });

  it('3: WHEN no note is pinned THEN neither the `Pinned` row nor a rule row appears', () => {
    const notes = [makeNote('u1', 'Plain one\nbody'), makeNote('u2', 'Plain two\nbody')];
    const { lastFrame } = render(<NoteList notes={notes} selectedIndex={0} width={60} height={30} />);
    const rows = rowsOf(lastFrame() ?? '');
    expect(rows.some((r) => r.includes('Plain one'))).toBe(true);
    expect(rows.filter((r) => r.trim() === 'Pinned').length).toBe(0);
    expect(rows.filter(isRule).length).toBe(0);
  });

  it('4: WHEN `j` is written from the last pinned note THEN the selection is the first unpinned note (the `Pinned` row and the rule are never selectable)', async () => {
    const store = makeStore({ stubClient: {} });
    const add = (id: string, text: string, tags: string[], at: number) =>
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: id as unknown as EntityId,
        note: {
          content: text,
          systemTags: tags as never,
          tags: [],
          deleted: false,
          modificationDate: at,
          creationDate: at,
        },
      });
    add('a', 'Pin one\nbody', ['pinned'], 3000);
    add('b', 'Pin two\nbody', ['pinned'], 2000);
    add('c', 'Plain one\nbody', [], 1000);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    const selectedTitle = (f: string, title: string) =>
      rowsOf(f).some((r) => r.startsWith('>') && r.includes(title));
    await waitForFrame(lastFrame, (f) => selectedTitle(f, 'Pin one'));
    stdin.write('j');
    await waitForFrame(lastFrame, (f) => selectedTitle(f, 'Pin two'));
    stdin.write('j');
    await waitForFrame(lastFrame, (f) => selectedTitle(f, 'Plain one') && !selectedTitle(f, 'Pin two'));
    expect(rowsOf(lastFrame() ?? '').filter((r) => r.startsWith('>')).length).toBe(1);
  });

  it('5: WHEN a pinned note is not selected THEN its title line begins with a space and carries no `▪` mark and no yellow `\\x1b[33m`', () => {
    const notes = [pin('p1', 'Pin one\nbody'), pin('p2', 'Pin two\nbody'), makeNote('u1', 'Plain one\nbody')];
    const { lastFrame } = render(<NoteList notes={notes} selectedIndex={2} width={60} height={30} />);
    const frame = lastFrame() ?? '';
    const raw = frame.split('\n').find((l) => l.includes('Pin one')) ?? '';
    const row = rowsOf(frame).find((r) => r.includes('Pin one')) ?? '';
    expect(row.startsWith(' Pin one')).toBe(true);
    expect(frame.includes('▪')).toBe(false);
    expect(raw.includes('\x1b[33m')).toBe(false);
  });
});
