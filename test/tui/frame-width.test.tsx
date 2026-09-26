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

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('T200 frame-width: no line exceeds terminal width', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // long note: modificationDate 5000 → first / selected
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('long'),
      note: makeNote(
        'long',
        'Wide note\n' + 'x'.repeat(150),
        { creationDate: 1000, modificationDate: 5000 }
      ),
    });
    // second note with a tag → triggers 'All notes' / filter line
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('sec'),
      note: makeNote('sec', 'Second note\nbody', {
        creationDate: 1000,
        modificationDate: 1000,
        tags: ['home'],
      }),
    });
  });

  it('1: WHEN <App store={store} width={80} height={24} /> is rendered THEN every line of the frame has a length of at most 80, and the frame contains Preview: Wide note and xxxxxx', async () => {
    const { lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await vi.waitFor(
      () => {
        const frame = stripAnsi(lastFrame() ?? '');
        for (const line of frame.split('\n')) {
          expect(line.length).toBeLessThanOrEqual(80);
        }
        expect(frame).toContain('Preview: Wide note');
        expect(frame).toContain('xxxxxxxx');
      },
      { timeout: 2000 }
    );
  });

  it('2: WHEN it is rendered at width 120 and height 32 (tags pane opens by itself) THEN every line has a length of at most 120, the frame has at most 32 lines, and its first line contains Tags, Notes and Preview: Wide note', async () => {
    const { lastFrame } = render(
      <App store={store} width={120} height={32} />
    );

    await vi.waitFor(
      () => {
        const frame = stripAnsi(lastFrame() ?? '');
        for (const line of frame.split('\n')) {
          expect(line.length).toBeLessThanOrEqual(120);
        }
        const lines = frame.split('\n');
        expect(lines.length).toBeLessThanOrEqual(32);
        const firstLine = lines[0] ?? '';
        expect(firstLine).toContain('Tags');
        expect(firstLine).toContain('Notes');
        expect(firstLine).toContain('Preview: Wide note');
      },
      { timeout: 2000 }
    );
  });

  it('3: WHEN it is rendered at width 60 THEN every line has a length of at most 60; at width 40 after \'\\r\' every line has at most 40 and the frame contains Preview: Wide note', async () => {
    // width 60
    const { lastFrame: lastFrame60 } = render(
      <App store={store} width={60} height={24} />
    );
    await vi.waitFor(
      () => {
        const frame60 = stripAnsi(lastFrame60() ?? '');
        expect(frame60).toContain('Preview: Wide note');
        for (const line of frame60.split('\n')) {
          expect(line.length).toBeLessThanOrEqual(60);
        }
      },
      { timeout: 2000 }
    );

    // width 40 with Enter
    const { stdin, lastFrame: lastFrame40 } = render(
      <App store={store} width={40} height={24} />
    );
    stdin.write('\r');
    await vi.waitFor(
      () => {
        const frame40 = stripAnsi(lastFrame40() ?? '');
        for (const line of frame40.split('\n')) {
          expect(line.length).toBeLessThanOrEqual(40);
        }
        expect(frame40).toContain('Preview: Wide note');
      },
      { timeout: 2000 }
    );
  });

  it('4: WHEN src/tui/Preview.tsx is read THEN it contains Math.floor(width * 0.6) - 1 exactly 1 time', () => {
    const content = read('src/tui/Preview.tsx');
    const matches = content.match(/Math\.floor\(width \* 0\.6\) - 1/g);
    expect(matches).toHaveLength(1);
  });
});
