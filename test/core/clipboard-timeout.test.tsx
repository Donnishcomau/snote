// #219 (R1): a clipboard helper that never exits cannot freeze snote. The copy fails within a fixed
// time and the UI shows its normal "(copy failed)" notice.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { copyToClipboard } from '../../src/core/clipboard';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const savedPath = process.env.PATH;
const dirs: string[] = [];
afterEach(() => {
  process.env.PATH = savedPath;
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('#219 the clipboard helper has a time limit', () => {
  it("8: WHEN the clipboard command never exits (`sleep 5`), or ignores SIGTERM (`trap`), THEN `copyToClipboard` returns `false` in under 2500 ms each", () => {
    for (const command of [['sleep', '5'], ['sh', '-c', 'trap "" TERM; sleep 5']]) {
      const start = Date.now();
      const ok = copyToClipboard('https://simp.ly/p/abc123', command);
      expect(ok, command.join(' ')).toBe(false);
      expect(Date.now() - start, command.join(' ')).toBeLessThan(2500);
    }
  }, 10000);

  it('9: WHEN a fake `wl-copy` that never exits is first on PATH and `y` is written on a published note THEN the frame contains `(copy failed)` and not `(copied)`', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'wl-copy-hang-'));
    dirs.push(bin);
    writeFileSync(join(bin, 'wl-copy'), '#!/bin/sh\nexec sleep 5\n');
    chmodSync(join(bin, 'wl-copy'), 0o755);
    process.env.PATH = `${bin}:${savedPath}`;
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'note-pub' as unknown as EntityId,
      note: { content: 'Public note', systemTags: ['published'], tags: [], deleted: false, modificationDate: 1000, creationDate: 1000, publishURL: 'abc123' },
    });
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Public note');
    stdin.write('y');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('(copy failed)'), 2000);
    expect(frame).toContain('(copy failed)');
    expect(frame).not.toContain('(copied)');
  });
});
