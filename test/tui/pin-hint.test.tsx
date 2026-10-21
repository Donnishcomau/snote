/**
 * Issue #84: the footer names the pin key for the selected note.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const lines = (s: string | undefined): string[] => strip(s).split('\n');
const footer = (label: string): string => `? Help  n New  e Edit  g Add tag  / Search  q Quit  ${label}  Tab Tags`;

function renderWith(pinned: boolean, deleted = false): ReturnType<typeof render> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('pin-1') as never,
    note: makeNote('pin-1', 'The only note\nbody', { pinned, deleted, modificationDate: 1000 }),
  });
  return render(<App store={store} width={80} height={24} />);
}

describe('issue #84 footer shows the pin key', () => {
  it('1: WHEN an unpinned note is selected in the list THEN the footer shows `p Pin`', async () => {
    const r = renderWith(false);
    await waitForInput(r.stdin);
    const frame = await waitForFrame(r.lastFrame, (f) => lines(f).some((l) => l.trim() === footer('p Pin')));
    expect(lines(frame).filter((l) => l.includes('p Unpin'))).toEqual([]);
    r.unmount();
  });

  it('2: WHEN a pinned note is selected THEN the footer shows `p Unpin`', async () => {
    const r = renderWith(true);
    await waitForInput(r.stdin);
    const frame = await waitForFrame(r.lastFrame, (f) => lines(f).some((l) => l.trim() === footer('p Unpin')));
    expect(lines(frame).filter((l) => l.includes('p Pin'))).toEqual([]);
    r.unmount();
  });

  it('3: WHEN the Trash is shown THEN the footer shows no pin hint (pinning is off there)', async () => {
    const r = renderWith(false, true);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => lines(f).some((l) => l.startsWith('? Help')));
    expect(strip(r.lastFrame())).not.toContain('p Pin');
    r.stdin.write('T');
    const frame = await waitForFrame(r.lastFrame, (f) => lines(f).some((l) => l.startsWith('u Restore')) && f.includes('The only note'));
    expect(strip(frame)).not.toContain('p Pin');
    expect(strip(frame)).not.toContain('p Unpin');
    r.unmount();
  });

  it('4: WHEN the terminal is 80 columns wide THEN the footer still fits on one line', async () => {
    for (const pinned of [false, true]) {
      const r = renderWith(pinned);
      await waitForInput(r.stdin);
      const label = pinned ? 'p Unpin' : 'p Pin';
      const frame = await waitForFrame(r.lastFrame, (f) => lines(f).some((l) => l.trim() === footer(label)));
      const all = lines(frame);
      const at = all.findIndex((l) => l.startsWith('? Help'));
      expect(all[at].length).toBeLessThanOrEqual(80);
      expect(all[at + 1]).toMatch(/^\[connecting\] 1 note/);
      expect(all.length).toBeLessThanOrEqual(24);
      r.unmount();
    }
  });
});
