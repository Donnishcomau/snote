import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const LEFT = '\u001b[D';
const RIGHT = '\u001b[C';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll until `check` holds; returns the last frame seen. Throws otherwise.
async function framesUntil(
  lastFrame: () => string | undefined,
  check: (f: string) => boolean,
): Promise<string> {
  let last = '';
  for (let i = 0; i < 120; i++) {
    last = lastFrame() ?? '';
    if (check(last)) return last;
    await delay(25);
  }
  throw new Error('condition not met, last frame:\n' + last);
}

describe('T369 The preview-pane focus line reads focus: preview', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    testNotes.forEach((note, idx) => {
      const noteId = eid(`note-${idx + 1}`);
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId,
        note: {
          content: note.content,
          systemTags: note.systemTags,
          tags: note.tags,
          creationDate: note.creationDate,
          modificationDate: note.modificationDate,
          deleted: note.deleted,
        },
      });
    });
  });

  it("1: WHEN '\\t' (Tab) is written from the initial screen THEN the frame contains 'focus: preview' and does not contain 'focus: notes'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write('\t');

    const frame = await framesUntil(
      lastFrame,
      (f) => f.includes('focus: preview') && !f.includes('focus: notes'),
    );
    expect(frame).toContain('focus: preview');
    expect(frame).not.toContain('focus: notes');
  });

  it("2: WHEN '\\u001b[C' (rightArrow) is written from the initial screen THEN the frame contains 'focus: preview'; after '\\u001b[D' (leftArrow) it contains neither 'focus: preview' nor 'focus: tags'", async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await delay(50);

    stdin.write(RIGHT);
    const focused = await framesUntil(lastFrame, (f) => f.includes('focus: preview'));
    expect(focused).toContain('focus: preview');

    stdin.write(LEFT);
    const cleared = await framesUntil(
      lastFrame,
      (f) => !f.includes('focus: preview') && !f.includes('focus: tags'),
    );
    expect(cleared).not.toContain('focus: preview');
    expect(cleared).not.toContain('focus: tags');
  });

  it("3: WHEN src/ and test/ are searched THEN no file other than this test contains the text 'focus: notes'", () => {
    const files: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = dir + '/' + entry;
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          files.push(full);
        }
      }
    }
    walk('src');
    walk('test');

    const self = 'test/tui/focus-preview-label.test.tsx';
    const offenders = files.filter(
      (f) =>
        f !== self &&
        readFileSync(f, 'utf8').includes('focus: notes'),
    );
    expect(offenders).toEqual([]);
  });
});
