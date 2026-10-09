/**
 * T461: the inline editor takes the Preview's rows (height - 2) and divider.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const BODY = (k: number): string =>
  `Note n${k}\n\nalpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon ${k}\nsecond line`;
const LONG = `Note n1\n\n${Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')}`;
const FOOTER = 'Ctrl+S save · Esc cancel · Enter new line';

function setup(opts: { long?: boolean; tagged?: boolean; w: number; h: number }) {
  const store = makeStore({ stubClient: {} });
  const now = Date.now();
  for (let k = 1; k <= 4; k++) {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`n${k}`),
      note: {
        content: k === 1 && opts.long ? LONG : BODY(k),
        systemTags: [],
        tags: (opts.tagged ? ['work'] : []) as unknown as never[],
        deleted: false,
        modificationDate: now - k * 1000,
        creationDate: now - k * 1000,
      },
    });
  }
  const r = render(<App store={store} width={opts.w} height={opts.h} />);
  return { store, ...r };
}
const lines = (f: string | undefined): string[] => (f ?? '').split('\n');
const helpLine = (f: string | undefined): string => lines(f).find((l) => l.startsWith('? Help')) ?? '';

async function open(opts: Parameters<typeof setup>[0]) {
  const s = setup(opts);
  await waitForInput(s.stdin);
  await waitForFrame(s.lastFrame, 'Note n1');
  s.stdin.write('i');
  return s;
}

describe('inline editor fit (T461)', () => {
  it('1: WHEN n1 is LONG and APP(100, 24) opens it THEN within 1 s a line contains `Ctrl+S save · Esc cancel · Enter new line` and the line starting `? Help` contains neither `new line` nor `cancel`', async () => {
    const { lastFrame } = await open({ long: true, w: 100, h: 24 });
    const f = await waitForFrame(
      lastFrame,
      (x) => lines(x).some((l) => l.includes(FOOTER)) && !helpLine(x).includes('new line') && !helpLine(x).includes('cancel'),
      1000,
    );
    expect(lines(f).some((l) => l.includes(FOOTER))).toBe(true);
    expect(helpLine(f)).not.toContain('new line');
    expect(helpLine(f)).not.toContain('cancel');
  });

  it('2: WHEN APP(80, 12) opens n1 THEN the frame has at most `12` lines, the line starting `>Note n1` contains `│`, and no line contains `epsilonalpha`', async () => {
    const { lastFrame } = await open({ w: 80, h: 12 });
    const f = await waitForFrame(lastFrame, (x) => x.includes('Ctrl+S save'), 1000);
    expect(lines(f).length).toBeLessThanOrEqual(12);
    expect(lines(f).find((l) => l.startsWith('>Note n1'))).toContain('│');
    expect(lines(f).some((l) => l.includes('epsilonalpha'))).toBe(false);
  });

  it('3: WHEN APP(100, 18) opens n1 THEN the line starting `>Note n1` contains `│` and within 1 s a line contains `Ctrl+S save`', async () => {
    const { lastFrame } = await open({ w: 100, h: 18 });
    const f = await waitForFrame(
      lastFrame,
      (x) => (lines(x).find((l) => l.startsWith('>Note n1')) ?? '').includes('│') && lines(x).some((l) => l.includes('Ctrl+S save')),
      1000,
    );
    expect(lines(f).find((l) => l.startsWith('>Note n1'))).toContain('│');
    expect(lines(f).some((l) => l.includes('Ctrl+S save'))).toBe(true);
  });

  it('4: WHEN every note is tagged `work`, n1 is LONG and APP(120, 24) opens it THEN within 1 s a line contains `Ctrl+S save` and the `? Help` line does not contain `new line`', async () => {
    const { lastFrame } = await open({ long: true, tagged: true, w: 120, h: 24 });
    const f = await waitForFrame(lastFrame, (x) => lines(x).some((l) => l.includes('Ctrl+S save')) && !helpLine(x).includes('new line'), 1000);
    expect(lines(f).some((l) => l.includes('Ctrl+S save'))).toBe(true);
    expect(helpLine(f)).not.toContain('new line');
  });

  it('5: WHEN APP(100, 7) opens n1 THEN the frame has at most `7` lines, a line contains `Ctrl+S save` and the `? Help` line does not contain `new line`', async () => {
    const { lastFrame } = await open({ w: 100, h: 7 });
    const f = await waitForFrame(lastFrame, (x) => lines(x).some((l) => l.includes('Ctrl+S save')) && !helpLine(x).includes('new line'), 1000);
    expect(lines(f).length).toBeLessThanOrEqual(7);
    expect(lines(f).some((l) => l.includes('Ctrl+S save'))).toBe(true);
    expect(helpLine(f)).not.toContain('new line');
  });

  it('6: WHEN APP(100, 24) opens n1 and `X` then Ctrl+S (`\\x13`) are written THEN within 1 s n1\'s content ends with `second lineX`', async () => {
    const { stdin, lastFrame, store } = await open({ w: 100, h: 24 });
    await waitForFrame(lastFrame, 'Ctrl+S save');
    stdin.write('X');
    await waitForFrame(lastFrame, 'second lineX');
    stdin.write('\x13');
    await vi.waitFor(() => expect(store.getState().data.notes.get(eid('n1'))?.content.endsWith('second lineX')).toBe(true), { timeout: 1000 });
    expect(store.getState().data.notes.get(eid('n1'))?.content.endsWith('second lineX')).toBe(true);
  });
});
