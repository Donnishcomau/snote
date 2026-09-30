import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

const waitFor = async (fn: () => boolean, ms = 1500) => {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
};

// Helper to create a mock store factory that returns a stub store seeded with 2 notes
function createMakeStoreFor(): Mock {
  const seedStore = makeStore({ stubClient: {} });
  seedStore.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: 'n1' as never,
    note: { content: 'First note', systemTags: [], tags: [] },
  });
  seedStore.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: 'n2' as never,
    note: { content: 'Second note', systemTags: [], tags: [] },
  });
  return vi.fn(() => seedStore as Store<State>);
}

const requestCode = vi.fn().mockResolvedValue(undefined);
const completeLogin = vi.fn().mockResolvedValue('tok');

// The Unicode box-drawing character used as divider in the three-pane layout
const divider = '│';

describe('T252 Resize', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-resize-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1: WHEN Root is rendered with width 120 and height 32 and a store seeded with 2 notes THEN the frame contains |', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const makeStoreFor = createMakeStoreFor();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={120}
        height={32}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return frame && frame.includes(divider);
    });

    const frame = lastFrame();
    expect(frame).toBeDefined();
    expect(frame).toContain(divider);

    unmount();
  });

  it('2: WHEN stdout.columns is then overridden to 40 and resize is emitted THEN within 1 s the frame contains no | and still contains the first note title', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const makeStoreFor = createMakeStoreFor();
    const { lastFrame, stdout, unmount } = render(
      <Root
        dataDir={dir}
        width={120}
        height={32}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return frame && frame.includes(divider);
    });

    // Override stdout.columns to simulate a terminal resize to width 40
    Object.defineProperty(stdout, 'columns', { get: () => 40, configurable: true });
    stdout.emit('resize');

    await waitFor(() => {
      const frame = lastFrame();
      return frame && !frame.includes(divider) && frame.includes('First note');
    });

    const frame = lastFrame();
    expect(frame).not.toContain(divider);
    expect(frame).toContain('First note');

    unmount();
  });

  it('3: WHEN that same resize fires and the test stdout has no rows THEN the number of rendered frame lines is still 32, proving height fell back to its current value and did not become 0', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const makeStoreFor = createMakeStoreFor();
    const { lastFrame, stdout, unmount } = render(
      <Root
        dataDir={dir}
        width={120}
        height={32}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return frame && frame.includes(divider);
    });

    Object.defineProperty(stdout, 'columns', { get: () => 40, configurable: true });
    stdout.emit('resize');

    await waitFor(() => {
      const frame = lastFrame();
      return frame && !frame.includes(divider);
    });

    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    expect(lines.length).toBe(32);

    unmount();
  });

  it('4: WHEN Root is rendered at width 120 and no resize is emitted THEN the frame is unchanged from line 1 and contains |', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const makeStoreFor = createMakeStoreFor();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={120}
        height={32}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return frame && frame.includes(divider);
    });

    const frame = lastFrame();
    expect(frame).toBeDefined();
    expect(frame).toContain(divider);

    unmount();
  });
});
