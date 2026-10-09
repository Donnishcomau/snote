import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

import { StatusBar } from '../../src/tui/StatusBar';
import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

// Strip colour codes so the frame is plain text for substring checks.
const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;
(inkChalk as any).level = 0;

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('T426 status line note count is singular for 1', () => {
  it("1: WHEN <StatusBar connected={false} count={1} width={80} /> renders THEN the frame contains `1 note` and does not contain `1 notes`", async () => {
    const { lastFrame } = render(<StatusBar connected={false} count={1} width={80} />);
    const frame = await waitForFrame(lastFrame, '1 note');
    expect(frame).toContain('1 note');
    expect(frame).not.toContain('1 notes');
  });

  it('2: WHEN it renders with count 0, 2 and 21 THEN the frames contain `0 notes`, `2 notes` and `21 notes`', async () => {
    for (const count of [0, 2, 21]) {
      const { lastFrame } = render(
        <StatusBar connected={false} count={count} width={80} />,
      );
      const frame = await waitForFrame(lastFrame, `${count} notes`);
      expect(frame).toContain(`${count} notes`);
    }
  });

  it('3: WHEN the App renders a store with exactly one live note THEN the frame contains `[offline] 1 note` and does not contain `1 notes`', async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('only') as never,
      note: makeNote('only', 'Solo note\none live note', {
        creationDate: 1000,
        modificationDate: 1000,
      }),
    });

    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);

    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('[offline] 1 note') && !f.includes('1 notes'),
    );
    expect(frame).toContain('[offline] 1 note');
    expect(frame).not.toContain('1 notes');
  });
});
