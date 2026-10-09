import { render } from 'ink-testing-library';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Key } from 'ink';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { getKeyLog, recordKeyEvent, resetKeyLog, textRunEnded } from '../../src/tui/key-ring';
import type { EntityId } from '@vendor/types';

import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const eid = (id: string): EntityId => id as unknown as EntityId;

const joinedInputs = (): string => getKeyLog().map((e) => e.input).join('');

describe('key ring stores ESC-carrying pastes as <text> (T478)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('note-esc-1'),
      note: {
        content: 'esc note',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: 1000,
        creationDate: 1000,
      },
    });
    resetKeyLog();
  });

  it("1: WHEN the App is rendered with a selected note and `\\x1b[200~pw\\x1b-hunter99\\x1b[201~` is written in the list THEN no ring entry's input contains `hunter99`", async () => {
    // the note is selected only once the list has rendered it with the
    // cursor; writing before that does nothing
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>esc note');

    stdin.write('\x1b[200~pw\x1b-hunter99\x1b[201~');

    await vi.waitFor(
      () => {
        const log = getKeyLog();
        expect(log.length).toBeGreaterThan(0);
        // every recorded input is free of the pasted secret
        for (const entry of log) {
          expect(entry.input).not.toContain('hunter99');
        }
        expect(joinedInputs()).not.toContain('hunter99');
        // the paste debt drained: any replayed keystrokes were all masked
        expect(textRunEnded()).toBe(true);
        for (const entry of log) {
          expect(entry.input === '<text>' || !entry.input.includes('\x1b')).toBe(true);
        }
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it("2: WHEN `recordKeyEvent('ab\\x1bcd', {} as Key, false)` is called after `resetKeyLog()` THEN the only ring entry's input is `<text>`", () => {
    resetKeyLog();
    recordKeyEvent('ab\x1bcd', {} as Key, false);
    const log = getKeyLog();
    expect(log.length).toBe(1);
    expect(log[0].input).toBe('<text>');
  });

  it("3: WHEN `recordKeyEvent('j', {} as Key, false)` and `recordKeyEvent('', { upArrow: true } as Key, false)` are called after `resetKeyLog()` THEN the ring inputs are `j` and an empty string", () => {
    resetKeyLog();
    recordKeyEvent('j', {} as Key, false);
    recordKeyEvent('', { upArrow: true } as Key, false);
    expect(getKeyLog().map((e) => e.input)).toEqual(['j', '']);
  });
});
