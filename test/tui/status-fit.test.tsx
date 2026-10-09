import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { StatusBar } from '../../src/tui/StatusBar';
import { makeStore } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const lines = (s: string | undefined): string[] => strip(s).split('\n');

describe('T466 status line fits its width', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-statusfit-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function trashAt(
    cols: number,
  ): Promise<{ lastFrame: () => string | undefined; unmount: () => void }> {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const store = makeStore({ stubClient: {} });
    for (const n of ['a', 'b', 'c']) {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: `n-${n}` as never,
        note: { content: `Gone ${n}`, systemTags: [], tags: [], deleted: true },
      });
    }
    const r = render(
      <Root
        dataDir={dir}
        width={120}
        height={32}
        makeStoreFor={vi.fn(() => store as Store<State>)}
        requestCode={vi.fn().mockResolvedValue(undefined)}
        completeLogin={vi.fn().mockResolvedValue('tok')}
      />,
    );
    Object.defineProperty(r.stdout, 'columns', { get: () => cols, configurable: true });
    Object.defineProperty(r.stdout, 'rows', { get: () => 10, configurable: true });
    r.stdout.emit('resize');
    await waitForFrame(r.lastFrame, 'notes');
    await waitForInput(r.stdin);
    r.stdin.write('T');
    return r;
  }

  it('1: WHEN Root at 20x10 shows the trash view of 3 deleted notes THEN a line is exactly `[offline] 0 notes t…` and no line is longer than `20`.', async () => {
    const r = await trashAt(20);
    const f = await waitForFrame(r.lastFrame, (fr) => lines(fr).includes('[offline] 0 notes t…'));
    expect(lines(f)).toContain('[offline] 0 notes t…');
    for (const l of lines(f)) expect(l.length).toBeLessThanOrEqual(20);
    r.unmount();
  });

  it('2: WHEN the same runs at 40x10 THEN a line is exactly `[offline] 0 notes trash`.', async () => {
    const r = await trashAt(40);
    const f = await waitForFrame(r.lastFrame, (fr) =>
      lines(fr).includes('[offline] 0 notes trash'),
    );
    expect(lines(f)).toContain('[offline] 0 notes trash');
    r.unmount();
  });

  it('3: WHEN `<StatusBar connected={false} count={1000} width={12} pending={3} label="trash" />` renders THEN the frame (ANSI stripped) is exactly `[offline] 1…`.', () => {
    const { lastFrame, unmount } = render(
      <StatusBar connected={false} count={1000} width={12} pending={3} label="trash" />,
    );
    expect(strip(lastFrame())).toBe('[offline] 1…');
    unmount();
  });

  it('4: WHEN `<StatusBar connected={true} count={3} />` renders at width 17 and at width 19 THEN the frames are exactly `[connected] 3 no…` and `[connected] 3 notes`.', () => {
    const a = render(<StatusBar connected={true} count={3} width={17} />);
    expect(strip(a.lastFrame())).toBe('[connected] 3 no…');
    a.unmount();
    const b = render(<StatusBar connected={true} count={3} width={19} />);
    expect(strip(b.lastFrame())).toBe('[connected] 3 notes');
    b.unmount();
  });
});
