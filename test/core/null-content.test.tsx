/**
 * T295: a note with `content: null` from the server must not crash search,
 * the crash reporter, the checklist paths, or the editor launch.
 * Each guarded read treats missing content as the empty string.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { matchParsed, parseQuery } from '../../src/core/search';
import { sessionSnapshot } from '../../src/core/crash-ring';
import { App } from '../../src/tui/App';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const nullContentNote = (): Note =>
  ({
    content: null as unknown as string, // OMARCHY: boundary cast — the server can send null
    systemTags: [],
    tags: [],
    deleted: false,
    modificationDate: 1000,
    creationDate: 1000,
  }) as Note;

function seedNullContentNote(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n-null'),
    note: nullContentNote(),
  });
  return store;
}

describe('null-content note', () => {
  it('1: WHEN matchParsed is called with a note whose content is null and a parsed query with terms [a] THEN it returns false and does not throw', () => {
    const note = nullContentNote();
    const parsed = parseQuery('a');
    expect(parsed.terms).toEqual(['a']);
    let result!: boolean;
    expect(() => {
      result = matchParsed(note, parsed);
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it("2: WHEN <App> is rendered with a store holding one note whose content is null and / then a are written THEN the frame contains search: a and the app has not crashed (the frame still contains Notes)", async () => {
    const store = seedNullContentNote();
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={vi.fn()} runEditor={vi.fn()} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('/');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('a');
    await new Promise((r) => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toContain('search: a');
    expect(frame).toContain('Notes');
  });

  it('3: WHEN sessionSnapshot is called on a state holding one note whose content is null THEN its note lengths contain 0 and it does not throw', () => {
    const store = seedNullContentNote();
    const state = store.getState();
    let result!: ReturnType<typeof sessionSnapshot>;
    expect(() => {
      result = sessionSnapshot(state, [], { columns: 80, rows: 24, version: '0.0.1' });
    }).not.toThrow();
    expect(result.noteLengths).toContain(0);
  });

  it("4: WHEN the selected note's content is null and the edit action runs with a spy editor THEN the spy is called once with ''", async () => {
    const store = seedNullContentNote();
    const spyEditor = vi.fn().mockResolvedValue(null);
    const { stdin } = render(
      <App store={store} width={80} height={24} onQuit={vi.fn()} runEditor={spyEditor} />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('e');
    await new Promise((r) => setTimeout(r, 50));

    expect(spyEditor).toHaveBeenCalledTimes(1);
    expect(spyEditor).toHaveBeenCalledWith('');
  });
});
