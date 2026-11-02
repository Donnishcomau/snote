/**
 * Issue #72: only the focused pane shows the inverse selected row.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const ESC = String.fromCharCode(27);
const INVERSE = ESC + '[7m';
const eid = (id: string): EntityId => id as unknown as EntityId;
const strip = (s: string): string => s.split(ESC).map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, ''))).join('');

async function chalkOn(): Promise<() => void> {
  const inkPkgDir = dirname(createRequire(import.meta.url).resolve('ink'));
  const inkChalkPath = pathToFileURL(join(inkPkgDir, '..', 'node_modules', 'chalk', 'source', 'index.js')).href;
  const inkChalk = (await import(inkChalkPath)).default;
  const saved = inkChalk.level;
  inkChalk.level = 3;
  return () => {
    inkChalk.level = saved;
  };
}

function renderApp(): ReturnType<typeof render> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('f1') as never, note: makeNote('f1', 'Focus one\nfirst body', { modificationDate: 3000, tags: ['home'] }) });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('f2') as never, note: makeNote('f2', 'Focus two\nsecond body', { modificationDate: 2000, tags: ['work'] }) });
  return render(<App store={store} width={120} height={40} />);
}

// one frame line holds a row of every pane, split at the divider: each piece is one pane's row.
// rows below the heading line (line 0) that carry the inverse code:
const paneRows = (frame: string): string[] => frame.split('\n').slice(1).flatMap((l) => l.split('│'));
const inverseRows = (frame: string): string[] => paneRows(frame).filter((l) => l.includes(INVERSE));
const headingInverse = (frame: string): boolean => (frame.split('\n')[0] ?? '').includes(INVERSE);
const rowWith = (frame: string, text: string): string => paneRows(frame).find((l) => strip(l).includes(text)) ?? '';
// at 120 columns the tags pane opens by itself (an effect after the first frame); wait for it so Tab is deterministic
const ready = (f: string): boolean => strip(f).includes('>Focus one') && strip(f).includes('All notes');
const RIGHT = ESC + '[C';

describe('issue #72 only the focused pane shows the inverse selected row', () => {
  it('1: WHEN the list is focused THEN exactly one row of the frame carries `[7m` (the list\'s selected row), and the tag pane\'s selected row carries none', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp();
      await waitForInput(r.stdin);
      const frame = await waitForFrame(r.lastFrame, (f) => ready(f) && strip(f).includes('>All notes'));
      const rows = inverseRows(frame);
      expect(rows.length).toBe(1);
      expect(strip(rows[0])).toContain('>Focus one');
      expect(rowWith(frame, '>All notes')).not.toContain('[7m');
      r.unmount();
    } finally {
      restore();
    }
  });

  it('2: WHEN the tags pane is focused THEN the tag pane\'s selected row carries `[7m` and the list\'s selected row carries none and still starts with `>`', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp();
      await waitForInput(r.stdin);
      await waitForFrame(r.lastFrame, ready);
      r.stdin.write('t');
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('focus: tags') && inverseRows(f).length === 1);
      expect(strip(inverseRows(frame)[0])).toContain('>All notes');
      expect(inverseRows(frame)[0]).toContain(INVERSE + ESC + '[1m' + ESC + '[34m>All notes');
      const listRow = rowWith(frame, '>Focus one');
      expect(listRow).not.toContain('[7m');
      expect(strip(listRow).startsWith('>')).toBe(true);
      r.unmount();
    } finally {
      restore();
    }
  });

  it('3: WHEN the Preview is focused THEN no row in the tags pane or list carries `[7m`', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp();
      await waitForInput(r.stdin);
      await waitForFrame(r.lastFrame, ready);
      r.stdin.write(RIGHT);
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('focus: preview') && inverseRows(f).length === 0);
      expect(inverseRows(frame)).toEqual([]);
      expect(rowWith(frame, '>All notes')).not.toContain('[7m');
      expect(rowWith(frame, '>Focus one')).not.toContain('[7m');
      r.unmount();
    } finally {
      restore();
    }
  });

  it('4: WHEN focus moves with `Tab` three times THEN each step leaves exactly one inverse selected row or the inverse heading, never two panes highlighted', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp();
      await waitForInput(r.stdin);
      await waitForFrame(r.lastFrame, (f) => ready(f) && inverseRows(f).length === 1);
      const seen: string[] = [];
      // with the tags pane open, Tab moves focus list -> tags -> list -> tags
      for (const [want, row] of [['focus: tags', '>All notes'], ['', '>Focus one'], ['focus: tags', '>All notes']]) {
        r.stdin.write('\t');
        const frame = await waitForFrame(r.lastFrame, (f) =>
          inverseRows(f).length === 1 && strip(inverseRows(f)[0]).includes(row) && (want === '' ? !strip(f).includes('focus: tags') : strip(f).includes(want)),
        );
        seen.push(row);
        expect(headingInverse(frame)).toBe(true);
        expect(inverseRows(frame).length).toBe(1);
        expect(strip(inverseRows(frame)[0])).toContain(row);
      }
      expect(seen.length).toBe(3);
      r.unmount();
    } finally {
      restore();
    }
  });
});
