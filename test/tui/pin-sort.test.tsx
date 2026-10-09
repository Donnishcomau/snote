import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// In App frames a row may contain pane borders; cut at the first border char.
function ruleRows(frame: string): string[] {
  return frame
    .split('\n')
    .map((l) => (l.includes('│') ? l.slice(0, l.indexOf('│')) : l));
}

function isRuleRow(row: string): boolean {
  return /^─+$/.test(row.trim());
}

function rowsOf(frame: string): string[] {
  return ruleRows(frame).map(stripAnsi);
}

describe('T43: Pinned marker and sort mode in the status bar', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed notes in the store with all properties including dates
    testNotes.forEach((note, idx) => {
      const noteId = eid(`note-${idx + 1}`);
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId,
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
  });

  it('1: WHEN j then p are sent THEN before p the Pinned note row is above the single rule row and the Third normal note row below it, after j then p the rule row is below both of those rows and above Second normal note, the frame never contains Third normal note *, and note-5 has pinned in systemTags while note-4 has not', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Before p: exactly one rule row, Pinned note above it, Third normal below
    let rows = rowsOf(lastFrame() ?? '');
    expect(rows.filter(isRuleRow).length).toBe(1);
    let ruleIdx = rows.findIndex(isRuleRow);
    const pinnedIdx = rows.findIndex((r) => r.includes('Pinned note'));
    const thirdIdx = rows.findIndex((r) => r.includes('Third normal note'));
    expect(pinnedIdx).toBeGreaterThanOrEqual(0);
    expect(thirdIdx).toBeGreaterThanOrEqual(0);
    expect(pinnedIdx).toBeLessThan(ruleIdx);
    expect(ruleIdx).toBeLessThan(thirdIdx);

    // j: move down to Third normal note (second item)
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));

    // p: pin note-5 (Third normal note)
    stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));

    // Poll for exactly the acceptance values: the rule row sits below both
    // the Third normal note and Pinned note rows and above Second normal
    // note, and the frame never contains Third normal note *.
    let frame = lastFrame() ?? '';
    for (let i = 0; i < 60; i++) {
      rows = rowsOf(frame);
      const ruleIdxAfter = rows.findIndex(isRuleRow);
      const thirdAfter = rows.findIndex((r) => r.includes('Third normal note'));
      const pinnedAfter = rows.findIndex((r) => r.includes('Pinned note'));
      const secondAfter = rows.findIndex((r) => r.includes('Second normal note'));
      if (
        rows.filter(isRuleRow).length === 1 &&
        thirdAfter >= 0 &&
        pinnedAfter >= 0 &&
        secondAfter >= 0 &&
        thirdAfter < ruleIdxAfter &&
        pinnedAfter < ruleIdxAfter &&
        ruleIdxAfter < secondAfter &&
        !frame.includes('Third normal note *')
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
      frame = lastFrame() ?? '';
    }

    rows = rowsOf(frame);
    const ruleIdxFinal = rows.findIndex(isRuleRow);
    const thirdFinal = rows.findIndex((r) => r.includes('Third normal note'));
    const pinnedFinal = rows.findIndex((r) => r.includes('Pinned note'));
    const secondFinal = rows.findIndex((r) => r.includes('Second normal note'));
    expect(rows.filter(isRuleRow).length).toBe(1);
    expect(thirdFinal).toBeGreaterThanOrEqual(0);
    expect(pinnedFinal).toBeGreaterThanOrEqual(0);
    expect(secondFinal).toBeGreaterThanOrEqual(0);
    expect(thirdFinal).toBeLessThan(ruleIdxFinal);
    expect(pinnedFinal).toBeLessThan(ruleIdxFinal);
    expect(ruleIdxFinal).toBeLessThan(secondFinal);
    expect(frame).not.toContain('Third normal note *');

    const note5 = store.getState().data.notes.get('note-5' as never);
    const note4 = store.getState().data.notes.get('note-4' as never);
    expect(note5?.systemTags.includes('pinned')).toBe(true);
    expect(note4?.systemTags.includes('pinned')).toBe(false);
  });

  it('2: WHEN p is sent right after start THEN note-1 went from having pinned in systemTags to not having it, before p the frame has 1 rule row, after p it has 0, still contains >Pinned note and 4 notes', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    const note1Before = store.getState().data.notes.get('note-1' as never);
    expect(note1Before?.systemTags.includes('pinned')).toBe(true);

    // Before p: exactly 1 rule row (the pinned/unpinned separator)
    let frame = lastFrame() ?? '';
    for (let i = 0; i < 60; i++) {
      if (rowsOf(frame).filter(isRuleRow).length === 1) break;
      await new Promise((r) => setTimeout(r, 25));
      frame = lastFrame() ?? '';
    }
    expect(rowsOf(frame).filter(isRuleRow).length).toBe(1);

    // p: unpin note-1
    stdin.write('p');
    await new Promise((r) => setTimeout(r, 50));

    const note1After = store.getState().data.notes.get('note-1' as never);
    expect(note1After?.systemTags.includes('pinned')).toBe(false);

    // After p: 0 rule rows, still >Pinned note and 4 notes
    frame = lastFrame() ?? '';
    for (let i = 0; i < 60; i++) {
      const rows = rowsOf(frame);
      if (
        rows.filter(isRuleRow).length === 0 &&
        frame.includes('>Pinned note') &&
        frame.includes('4 notes')
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
      frame = lastFrame() ?? '';
    }
    expect(rowsOf(frame).filter(isRuleRow).length).toBe(0);
    expect(frame).toMatch(/>Pinned note/);
    expect(frame).toContain('4 notes');
  });

  it('3: WHEN m is sent twice right after start THEN after the first note-1 has markdown in systemTags, after the second it has not, and pinned is still there both times', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // First m: enable markdown on note-1
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));

    const note1AfterFirst = store.getState().data.notes.get('note-1' as never);
    expect(note1AfterFirst?.systemTags).toContain('markdown');
    expect(note1AfterFirst?.systemTags).toContain('pinned');

    // Second m: disable markdown on note-1
    stdin.write('m');
    await new Promise((r) => setTimeout(r, 50));

    const note1AfterSecond = store.getState().data.notes.get('note-1' as never);
    expect(note1AfterSecond?.systemTags).toContain('pinned');
    expect(note1AfterSecond?.systemTags).not.toContain('markdown');
  });

  it('4: WHEN s is sent three times THEN before the first the frame has no sort:, after the first it contains 4 notes sort: created, after the second sort: a-z, after the third no sort: again', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    expect(frame).not.toContain('sort:');

    // First s: cycle to creationDate
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('4 notes sort: created');

    // Second s: cycle to alphabetical
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('sort: a-z');

    // Third s: cycle back to modificationDate (default, no sort: shown)
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).not.toContain('sort:');
  });

  it('5: WHEN s, s and then S are sent THEN after s, s the frame order is Pinned note, First normal note, Second normal note, Third normal note; after S it contains sort: a-z (rev) and the order is Pinned note, Third, Second, First', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // First s: creationDate
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    // Second s: alphabetical
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    const pinnedIdx = frame.indexOf('Pinned note');
    const firstIdx = frame.indexOf('First normal note');
    const secondIdx = frame.indexOf('Second normal note');
    const thirdIdx = frame.indexOf('Third normal note');
    expect(pinnedIdx).toBeLessThan(firstIdx);
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);

    // S: reverse sort
    stdin.write('S');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('sort: a-z (rev)');

    const pinnedIdx2 = frame.indexOf('Pinned note');
    const thirdIdx2 = frame.indexOf('Third normal note');
    const secondIdx2 = frame.indexOf('Second normal note');
    const firstIdx2 = frame.indexOf('First normal note');
    expect(pinnedIdx2).toBeLessThan(thirdIdx2);
    expect(thirdIdx2).toBeLessThan(secondIdx2);
    expect(secondIdx2).toBeLessThan(firstIdx2);
  });

  it('6: WHEN T and then s are sent THEN after T the frame line with 1 notes contains trash and no sort:, after s that line contains trash  sort: created', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise((r) => setTimeout(r, 50));

    // T: enter trash view
    stdin.write('T');
    await new Promise((r) => setTimeout(r, 50));

    let frame = lastFrame();
    // Should have 1 note in trash
    expect(frame).toContain('1 note');
    expect(frame).toContain('trash');
    expect(frame).not.toContain('sort:');

    // s: cycle sort (still in trash)
    stdin.write('s');
    await new Promise((r) => setTimeout(r, 50));

    frame = lastFrame();
    expect(frame).toContain('trash  sort: created');
  });
});
