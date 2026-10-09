/**
 * T391: the notice line tells the user an update is available or downloaded.
 * The green notice line above the key hints shows the update signal:
 * `available` names the steps, `restart` says to restart snote / the bar.
 * Any keypress clears it, as for every notice.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
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

describe('update notice (T391)', () => {
  it("1: WHEN fixture N renders and then publishUpdate({ kind: 'available' }) runs THEN, polled, the frame contains \\u001b[33mupdate available: omarchy plugin update io.github.donnishcomau.snote-simplenote\\u001b[39m", async () => {
    const { lastFrame } = renderN();
    publishUpdate({ kind: 'available' });
    await pollUntil(() =>
      (lastFrame() ?? '').includes(
        '\u001b[33mupdate available: omarchy plugin update io.github.donnishcomau.snote-simplenote\u001b[39m'
      )
    );
    expect(lastFrame()).toContain(
      '\u001b[33mupdate available: omarchy plugin update io.github.donnishcomau.snote-simplenote\u001b[39m'
    );
  });

  it("2: WHEN the same signal is showing THEN, polled, the frame contains \\u001b[33mthen click the bar button, then run omarchy-restart-shell\\u001b[39m", async () => {
    const { lastFrame } = renderN();
    publishUpdate({ kind: 'available' });
    await pollUntil(() =>
      (lastFrame() ?? '').includes(
        '\u001b[33mthen click the bar button, then run omarchy-restart-shell\u001b[39m'
      )
    );
    expect(lastFrame()).toContain(
      '\u001b[33mthen click the bar button, then run omarchy-restart-shell\u001b[39m'
    );
  });

  it("3: WHEN fixture N renders and publishUpdate({ kind: 'restart', available: '0.2.3' }) runs THEN, polled, the frame contains snote 0.2.3 is downloaded: restart snote / the bar to use the update", async () => {
    const { lastFrame } = renderN();
    publishUpdate({ kind: 'restart', available: '0.2.3' });
    await pollUntil(() =>
      (lastFrame() ?? '').includes('snote 0.2.3 is downloaded: restart snote / the bar to use the update')
    );
    expect(lastFrame()).toContain('snote 0.2.3 is downloaded: restart snote / the bar to use the update');
  });

  it('4: WHEN publishUpdate({ kind: \'available\' }) ran BEFORE fixture N rendered at width 100 THEN after 50 ms the frame contains update available: omarchy plugin update and lastFrame().split(\'\\n\').length is 24', async () => {
    inkChalk.level = 3;
    publishUpdate({ kind: 'available' });
    const store = seedStore();
    const { lastFrame } = render(<App store={store} width={100} height={24} />);
    await new Promise((r) => setTimeout(r, 50));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('update available: omarchy plugin update');
    expect(frame.split('\n').length).toBe(24);
  });

  it('5: WHEN the notice of line 1 is showing and `j` is written THEN, polled, the frame does not contain update available', async () => {
    const { stdin, lastFrame } = renderN();
    publishUpdate({ kind: 'available' });
    await pollUntil(() => (lastFrame() ?? '').includes('update available'));
    stdin.write('j');
    await pollUntil(() => !(lastFrame() ?? '').includes('update available'));
    expect(lastFrame()).not.toContain('update available');
  });

  it('6: WHEN no signal was published THEN the frame of fixture N contains neither update available nor is downloaded', async () => {
    const { lastFrame } = renderN();
    await pollUntil(() => (lastFrame() ?? '').length > 0);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('update available');
    expect(frame).not.toContain('is downloaded');
  });
});
