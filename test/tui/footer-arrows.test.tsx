/**
 * Issue #74: the footer names the arrow keys; tag names are not cut silently.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { TagPane } from '../../src/tui/TagPane';
import { paneLayout } from '../../src/core/layout';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const NAME18 = 'abcdefghijklmnopqr';
const NAME40 = 'a-very-long-tag-name-of-forty-characters';

function renderApp(width: number, height: number): ReturnType<typeof render> {
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('k1') as never, note: makeNote('k1', 'Arrow note\nbody line', { modificationDate: 3000, tags: ['home'] }) });
  return render(<App store={store} width={width} height={height} />);
}

const footerLine = (frame: string): string => frame.split('\n').find((l) => l.startsWith('? Help') || l.startsWith('j/k Move')) ?? '';

describe('issue #74 footer names the arrow keys; tag names are not cut silently', () => {
  it('1: WHEN the list is focused at width 80 THEN the footer contains `Tab Tags` and `←→ Panes` and is at most 80 cells', async () => {
    const r = renderApp(80, 24);
    await waitForInput(r.stdin);
    const frame = await waitForFrame(r.lastFrame, (f) => footerLine(f).includes('Tab Tags') && footerLine(f).includes('←→ Panes'));
    const line = footerLine(frame);
    expect(line).toContain('Tab Tags');
    expect(line).toContain('←→ Panes');
    expect(line.length).toBeLessThanOrEqual(80);
    r.unmount();
  });

  it('2: WHEN the tags pane is focused THEN the footer contains `Tab/→ Notes`', async () => {
    const r = renderApp(80, 24);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => footerLine(f).startsWith('? Help'));
    r.stdin.write('t');
    const frame = await waitForFrame(r.lastFrame, (f) => footerLine(f).startsWith('j/k Move') && footerLine(f).includes('Tab/→ Notes'));
    expect(footerLine(frame)).toContain('Tab/→ Notes');
    expect(footerLine(frame).length).toBeLessThanOrEqual(80);
    r.unmount();
  });

  it('3: WHEN a tag name of 18 characters exists and the terminal is 120 wide THEN the tag pane shows the name in full', () => {
    const { tagsWidth } = paneLayout(120, true, false, false);
    const r = render(<TagPane tags={[NAME18]} selectedIndex={0} focused={false} width={tagsWidth} height={8} divider />);
    const frame = r.lastFrame() ?? '';
    r.unmount();
    expect(frame).toContain(' ' + NAME18);
    expect(frame).not.toContain('…');
  });

  it('4: WHEN a tag name of 40 characters exists THEN its row ends in `…` and is no wider than 24 cells', () => {
    const { tagsWidth } = paneLayout(120, true, false, false);
    const r = render(<TagPane tags={[NAME40]} selectedIndex={0} focused={false} width={tagsWidth} height={8} divider />);
    const lines = (r.lastFrame() ?? '').split('\n');
    r.unmount();
    const row = lines.find((l) => l.includes('a-very-long')) ?? '';
    const cell = row.split('│')[0].trimEnd();
    expect(cell.endsWith('…')).toBe(true);
    expect(cell.startsWith(' a-very-long-tag')).toBe(true);
    expect(row.length).toBeLessThanOrEqual(24);
    expect(row).not.toContain(NAME40);
  });

  it('5: WHEN the terminal is 80 wide with the pane open THEN the list and preview columns still fit (no line is wider than 80)', async () => {
    const r = renderApp(80, 24);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => footerLine(f).startsWith('? Help'));
    r.stdin.write('t');
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes('focus: tags') && f.includes('Preview: Arrow note'));
    const lines = frame.split('\n');
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(80);
    expect(lines[0].split('│').map((p) => p.trimEnd())).toEqual(['Tags', 'Notes', 'Preview: Arrow note']);
    expect(lines.some((l) => l.includes('>Arrow note'))).toBe(true);
    r.unmount();
  });
});
