/**
 * Issue #80: two test gaps left after the chunk-keys rework (#35).
 * F223: the key ring's paste debt has a floor of 0 (a keystroke with no debt
 * open never takes it below zero, and is stored as typed). PR77-01: Ctrl+C
 * followed by an arrow in one read (`\x03\x1b[D`) quits nothing.
 * Test-only: no code under src/ changes.
 */
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import React from 'react';
import type { Key } from 'ink';
import type { Store } from 'redux';
import type { EntityId } from '@vendor/types';

import { makeStore } from '../../src/core/store';
import type { State } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { SEVERAL_KEYS } from '../../src/tui/read-gate';
import { Root } from '../../src/tui/Root';
import { beginTextRun, getKeyLog, recordKeyEvent, resetKeyLog, textRunEnded } from '../../src/tui/key-ring';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const eid = (id: string): EntityId => id as unknown as EntityId;
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Root with a saved token and note t1 `hello world`. */
async function mount() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunk-keys-gaps-'));
  dirs.push(dir);
  await saveToken(dir, { email: 'a@b.co', token: 'tok' });
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content: 'hello world', systemTags: [], tags: [], deleted: false, modificationDate: 2000, creationDate: 2000 },
  });
  const onQuit: Mock<() => void> = vi.fn();
  const r = render(
    <Root dataDir={dir} width={80} height={24} makeStoreFor={vi.fn(() => store as Store<State>)} requestCode={vi.fn()} completeLogin={vi.fn()} onQuit={onQuit} />,
  );
  await waitForInput(r.stdin);
  return { ...r, onQuit };
}

describe('issue #80 chunk-keys test gaps', () => {
  it("1: WHEN no paste debt is open and `j` is recorded THEN `textRunEnded()` is `true` and the ring input is `j`, and after `beginTextRun(1)` key `k` is stored as `<text>` and `m` as `m`", () => {
    resetKeyLog();
    recordKeyEvent('j', {} as Key, false);
    // floor 0: with no debt open the key is typed, and the debt stays at 0 (never negative)
    expect(textRunEnded()).toBe(true);
    expect(getKeyLog().map((e) => e.input)).toEqual(['j']);
    // a debt of exactly 1 masks exactly one key; had `j` taken the debt to -1 this would mask nothing
    beginTextRun(1);
    expect(textRunEnded()).toBe(false);
    recordKeyEvent('k', {} as Key, false);
    expect(textRunEnded()).toBe(true);
    recordKeyEvent('m', {} as Key, false);
    expect(textRunEnded()).toBe(true);
    expect(getKeyLog().map((e) => e.input)).toEqual(['j', '<text>', 'm']);
  });

  it('2: WHEN the list shows note t1 `hello world` and `\\x03\\x1b[D` arrives as one read THEN `onQuit` is called `0` times, the frame still contains `hello world`, and the key ring holds no left-arrow entry', async () => {
    const a = await mount();
    await waitForFrame(a.lastFrame, 'hello world');
    resetKeyLog();
    a.stdin.write('\x03\x1b[D');
    // the read ended at Ctrl+C and the arrow was dropped and reported: wait for that before asserting
    const frame = await waitForFrame(a.lastFrame, (f) => f.includes(SEVERAL_KEYS) && f.includes('hello world'));
    expect(a.onQuit).toHaveBeenCalledTimes(0);
    expect(frame).toContain('hello world');
    expect(getKeyLog().some((e) => e.key.leftArrow === true)).toBe(false);
    a.unmount();
  });
});
