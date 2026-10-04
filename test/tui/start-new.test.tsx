import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll until the frame looks right; every asserted value sits in the poll.
async function settle(
  lastFrame: () => string | undefined,
  wanted: (frame: string) => boolean
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (wanted(lastFrame() ?? '')) return;
    await delay(25);
  }
}

const CONTENT = 'Started from bar\nbody';

// Two seeded notes: the pinned one and a newer normal note, so the idle
// frame shows exactly `>Second normal note` and `2 notes`. The fixture's
// makeNote drops its id and stamps creationDate with Date.now(), so seed
// with the fixture's index-based ids instead (as new-note-selected does).
function seedNotes(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  for (const [idx, note] of [testNotes[0], testNotes[3]].entries()) {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx === 0 ? 1 : 4}`),
      note: {
        content: note.content,
        systemTags: note.systemTags,
        tags: note.tags,
        deleted: note.deleted,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      },
    });
  }
  return store;
}

describe('T361 --new opens the editor for a new note once', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = seedNotes();
  });

  it("1: WHEN <App ... runEditor={runEditor} startNew /> is rendered THEN, within the poll, runEditor was called once with '', data.notes.size is 3, and the frame contains >Started from bar", async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} startNew />
    );

    let ok = false;
    await settle(
      lastFrame,
      (f) =>
        (ok =
          runEditor.mock.calls.length === 1 &&
          runEditor.mock.calls[0][0] === '' &&
          store.getState().data.notes.size === 3 &&
          f.includes('>Started from bar'))
    );

    expect(ok).toBe(true);
  });

  it('2: WHEN j is written after the note appeared THEN runEditor was called 1 time in total; a second App rendered without startNew calls its runEditor 0 times', async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const r1 = render(
      <App store={store} width={80} height={24} runEditor={runEditor} startNew />
    );
    const { stdin, lastFrame } = r1;

    await settle(lastFrame, (f) => f.includes('>Started from bar'));

    stdin.write('j');
    await delay(50);

    expect(runEditor).toHaveBeenCalledTimes(1);

    const store2 = seedNotes();
    const runEditor2 = vi.fn().mockResolvedValue(CONTENT);
    // unmount the first app before the second render: both share
    // process.stdout and the first keeps overwriting the frames.
    r1.unmount();
    const { lastFrame: lastFrame2 } = render(
      <App store={store2} width={80} height={24} runEditor={runEditor2} />
    );
    await delay(50);

    expect(runEditor2).toHaveBeenCalledTimes(0);
    // the second App shows its own list, untouched by the first:
    // 2 seeded notes, no new one created.
    expect(lastFrame2() ?? '').toContain('2 notes');
  });

  it('3: WHEN src/tui/Root.tsx is read THEN it contains startNew?: boolean and startNew={props.startNew}, each exactly 1 time', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/tui/Root.tsx'), 'utf8');
    expect(src.split('startNew?: boolean').length - 1).toBe(1);
    expect(src.split('startNew={props.startNew}').length - 1).toBe(1);
  });

  it("4: WHEN src/cli/main.tsx is read THEN the text from React.createElement(Root, { to the first }) contains startNew, and the file contains splitNewFlag( exactly 1 time", () => {
    const src = readFileSync(resolve(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    const start = src.indexOf('React.createElement(Root, {');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('})', start);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).toContain('startNew');
    expect(src.split('splitNewFlag(').length - 1).toBe(1);
  });

  it("5: WHEN src/tui/App.tsx is read THEN the line starting '  useAppEffects(' contains startNew, the file contains startNew?: boolean, and trimEnd().split('\\n').length is 247", () => {
    const src = readFileSync(resolve(process.cwd(), 'src/tui/App.tsx'), 'utf8');
    const line = src.split('\n').find((l) => l.startsWith('  useAppEffects('));
    expect(line).toBeDefined();
    expect(line).toContain('startNew');
    expect(src).toContain('startNew?: boolean');
    expect(src.trimEnd().split('\n').length).toBe(247);
  });
});
