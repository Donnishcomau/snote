/**
 * T441: core code can publish a failure message through the problem
 * signal and the notice line shows it in the error colour. The signal is
 * module-level (same shape as the update signal), so a write failure in
 * core code reaches the screen without crashing snote or being swallowed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import {
  publishProblem,
  currentProblem,
  onProblem,
  resetProblemSignal,
  problemText,
} from '../../src/core/problem-signal';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (
  await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)
).default;
const chalkLevel = inkChalk.level;

const eid = (id: string): EntityId => id as unknown as EntityId;

function seedStore(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  testNotes.forEach((note, idx) => {
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
  return store;
}

const PROBLEM = 'could not save notes: EISDIR';

beforeEach(() => {
  resetProblemSignal();
});

afterEach(() => {
  resetProblemSignal();
  inkChalk.level = chalkLevel;
});

describe('problem notice (T441)', () => {
  it("1: WHEN problemText gets label `could not save notes` with an Error whose code is `EISDIR`, then with `new Error('boom')` THEN it returns `could not save notes: EISDIR`, then `could not save notes: boom`", () => {
    const err = new Error('is a directory');
    (err as Error & { code?: string }).code = 'EISDIR';
    expect(problemText('could not save notes', err)).toBe('could not save notes: EISDIR');
    expect(problemText('could not save notes', new Error('boom'))).toBe('could not save notes: boom');
  });

  it("2: WHEN a listener is added with onProblem, publishProblem('a') runs twice, the listener is removed and publishProblem('b') runs THEN the listener was called `2` times, each with `a`, and currentProblem() is `b`", () => {
    const seen: string[] = [];
    const off = onProblem((message) => seen.push(message));
    publishProblem('a');
    publishProblem('a');
    off();
    publishProblem('b');
    expect(seen).toEqual(['a', 'a']);
    expect(currentProblem()).toBe('b');
  });

  it("3: WHEN `<App store={store} width={100} height={24} />` (stub store) has rendered and publishProblem('could not save notes: EISDIR') runs THEN within 1 s the frame contains `could not save notes: EISDIR`", async () => {
    const store = seedStore();
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    publishProblem('could not save notes: EISDIR');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('could not save notes: EISDIR'),
      1000
    );
    expect(frame).toContain('could not save notes: EISDIR');
  });

  it("4: WHEN publishProblem('could not save notes: EISDIR') runs before the App renders, with chalk forced to level 3 THEN the first frame contains `\\u001b[31mcould not save notes: EISDIR\\u001b[39m`", async () => {
    inkChalk.level = 3;
    publishProblem('could not save notes: EISDIR');
    const store = seedStore();
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('\u001b[31mcould not save notes: EISDIR\u001b[39m')
    );
    expect(frame).toContain('\u001b[31mcould not save notes: EISDIR\u001b[39m');
  });

  it("5: WHEN resetProblemSignal() ran and the App renders with nothing published THEN the frame does not contain `could not` and currentProblem() is `null`", async () => {
    resetProblemSignal();
    const store = seedStore();
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    const frame = await waitForFrame(lastFrame, (f) => f.length > 0 && !f.includes('could not'));
    expect(frame).not.toContain('could not');
    expect(currentProblem()).toBeNull();
  });
});
