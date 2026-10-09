/**
 * T427: the update notice takes the warning role (yellow), not the green
 * used for success. Both update kinds render yellow; errors stay red and
 * all other notices stay green.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { noticeColor } from '../../src/tui/notice';
import { theme } from '../../src/tui/theme';
import { testNotes } from './fixtures';
import { publishUpdate, resetUpdateSignal } from '../../src/core/update-signal';
import type { EntityId } from '@vendor/types';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)).default;
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

/** Fixture N: the App with the 5 testNotes, width 80, height 24, chalk forced. */
function renderN(): { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined } {
  inkChalk.level = 3;
  const store = seedStore();
  return render(<App store={store} width={80} height={24} />);
}

async function pollUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2500;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('condition not met before deadline');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

afterEach(() => {
  resetUpdateSignal();
  inkChalk.level = chalkLevel;
});

describe('update notice colour (T427)', () => {
  it("1: WHEN fixture N renders and publishUpdate({ kind: 'available' }) runs THEN, polled, the frame contains \\u001b[33mupdate available: omarchy plugin update and not \\u001b[32mupdate available", async () => {
    const { lastFrame } = renderN();
    publishUpdate({ kind: 'available' });
    await pollUntil(
      () =>
        (lastFrame() ?? '').includes('\u001b[33mupdate available: omarchy plugin update') &&
        !(lastFrame() ?? '').includes('\u001b[32mupdate available')
    );
    expect(lastFrame()).toContain('\u001b[33mupdate available: omarchy plugin update');
    expect(lastFrame()).not.toContain('\u001b[32mupdate available');
  });

  it("2: WHEN publishUpdate({ kind: 'restart', available: '0.2.3' }) runs instead THEN, polled, the frame contains \\u001b[33msnote 0.2.3 is downloaded", async () => {
    const { lastFrame } = renderN();
    publishUpdate({ kind: 'restart', available: '0.2.3' });
    await pollUntil(() =>
      (lastFrame() ?? '').includes('\u001b[33msnote 0.2.3 is downloaded')
    );
    expect(lastFrame()).toContain('\u001b[33msnote 0.2.3 is downloaded');
  });

  it("3: WHEN noticeColor gets { message: 'New note saved', isError: false } and { message: 'x', isError: true } THEN it returns green and red", () => {
    expect(noticeColor({ message: 'New note saved', isError: false })).toBe('green');
    expect(noticeColor({ message: 'x', isError: true })).toBe('red');
    expect(theme.success.color).toBe('green');
    expect(theme.error.color).toBe('red');
  });
});
