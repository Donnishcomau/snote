/**
 * Issue #73: the focused pane heading is a full-width accent bar.
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
const BAR_START = INVERSE + ESC + '[1m' + ESC + '[34m';
const BAR_END = ESC + '[39m' + ESC + '[22m' + ESC + '[27m';
const DIM = ESC + '[2m';
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

function renderApp(width: number, height: number): ReturnType<typeof render> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('h1') as never, note: makeNote('h1', 'Focus one\nfirst body', { modificationDate: 3000, tags: ['home'] }) });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('h2') as never, note: makeNote('h2', 'Focus two\nsecond body', { modificationDate: 2000, tags: ['work'] }) });
  return render(<App store={store} width={width} height={height} />);
}

// the heading line split at the dividers: one piece per pane, the divider's dim code dropped
const headingPieces = (frame: string): string[] =>
  (frame.split('\n')[0] ?? '').split('│').map((p) => (p.endsWith(DIM) ? p.slice(0, -DIM.length) : p));
// the cells a piece takes on screen
const cells = (piece: string): number => strip(piece).length;
// true when the piece is one accent bar from its first cell to its last
const isBar = (piece: string, label: string): boolean =>
  piece.startsWith(BAR_START + label) && piece.endsWith(BAR_END) && piece.split(ESC).length === 7 && strip(piece).trimEnd() === label;

describe('issue #73 the focused pane heading is a full-width accent bar', () => {
  it('1: WHEN the list is focused at width 120 THEN the `Notes` heading line is inverse across the whole list column (the heading text padded to the column width, ends before the divider)', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp(120, 40);
      await waitForInput(r.stdin);
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('>Focus one') && headingPieces(f).some((p) => p.includes('Notes ')));
      const pieces = headingPieces(frame);
      const notes = pieces.find((p) => strip(p).startsWith('Notes')) ?? '';
      expect(isBar(notes, 'Notes')).toBe(true);
      const row = (frame.split('\n')[2] ?? '').split('│');
      expect(cells(notes)).toBe(strip(row[pieces.indexOf(notes)] ?? '').length);
      expect(strip(frame.split('\n')[0] ?? '')).toContain('│');
      // the bar takes one line: the selected note is still the first row under it
      expect(strip((frame.split('\n')[1] ?? '').split('│')[pieces.indexOf(notes)] ?? '').startsWith('>Focus one')).toBe(true);
      r.unmount();
    } finally {
      restore();
    }
  });

  it('2: WHEN the tags pane is focused THEN the `Tags` heading is padded to the pane width, and `Notes` is bold and not inverse', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp(120, 40);
      await waitForInput(r.stdin);
      await waitForFrame(r.lastFrame, (f) => strip(f).includes('>Focus one'));
      r.stdin.write('t');
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('focus: tags') && isBar(headingPieces(f)[0] ?? '', 'Tags'));
      const pieces = headingPieces(frame);
      expect(isBar(pieces[0], 'Tags')).toBe(true);
      expect(cells(pieces[0])).toBe(strip((frame.split('\n')[2] ?? '').split('│')[0]).length);
      const notes = pieces.find((p) => strip(p).startsWith('Notes')) ?? '';
      expect(notes).toContain(ESC + '[1m');
      expect(notes).not.toContain('[7m');
      r.unmount();
    } finally {
      restore();
    }
  });

  it('3: WHEN no pane but the list has focus THEN exactly one heading carries `[7m`', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp(120, 40);
      await waitForInput(r.stdin);
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('>Focus one') && strip(f).includes('Preview: Focus one'));
      const inverse = headingPieces(frame).filter((p) => p.includes('[7m'));
      expect(inverse.length).toBe(1);
      expect(strip(inverse[0]).trimEnd()).toBe('Notes');
      r.unmount();
    } finally {
      restore();
    }
  });

  it('4: WHEN the frame is stripped of ANSI codes THEN the heading text is unchanged (`Notes`, `Tags`, `Preview: <title>`), so the width of every line stays the same', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp(120, 40);
      await waitForInput(r.stdin);
      await waitForFrame(r.lastFrame, (f) => strip(f).includes('>Focus one'));
      r.stdin.write('t');
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('focus: tags'));
      const words = strip(frame.split('\n')[0] ?? '').split('│').map((p) => p.trimEnd());
      expect(words).toEqual(['Tags', 'Notes', 'Preview: Focus one']);
      const lines = strip(frame).split('\n');
      const bar = lines[0].indexOf('│');
      expect(lines[1].indexOf('│')).toBe(bar);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(120);
      r.unmount();
    } finally {
      restore();
    }
  });

  it('5: WHEN the terminal is 80x24 THEN the heading bars do not wrap or push the divider', async () => {
    const restore = await chalkOn();
    try {
      const r = renderApp(80, 24);
      await waitForInput(r.stdin);
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('>Focus one'));
      const lines = frame.split('\n');
      expect(lines.length).toBeLessThanOrEqual(24);
      const plain = lines.map(strip);
      expect(plain[0].indexOf('│')).toBe(plain[2].indexOf('│'));
      expect(plain[1].startsWith('>Focus one')).toBe(true);
      const notes = headingPieces(frame)[0] ?? '';
      expect(isBar(notes, 'Notes')).toBe(true);
      expect(cells(notes)).toBe(plain[2].indexOf('│'));
      r.unmount();
    } finally {
      restore();
    }
  });
});
