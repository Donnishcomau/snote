import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import type { EntityId, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;

describe('Pane focus indicator', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });

    // Seed 2 notes: note p1 titled "Alpha note" tagged home, note p2 titled "Beta note"
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('p1'),
      note: {
        content: 'Alpha note',
        creationDate: 1000,
        deleted: false,
        modificationDate: 1000,
        systemTags: [],
        tags: [tname('home')],
      },
    });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('p2'),
      note: {
        content: 'Beta note',
        creationDate: 2000,
        deleted: false,
        modificationDate: 2000,
        systemTags: [],
        tags: [],
      },
    });
  });

  it('1: WHEN <App store={store} width={80} height={24} /> renders (2 seeded notes: note p1 titled Alpha note tagged home, note p2 titled Beta note) THEN the frame does not contain focus: tags and does not contain focus: preview', async () => {
    const { lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).not.toContain('focus: tags');
    expect(frame).not.toContain('focus: preview');
  });

  it('2: WHEN t is written THEN the frame contains focus: tags', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('t');
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).toContain('focus: tags');
  });

  it('3: WHEN t then \\t (Tab) are written THEN the frame does not contain focus: tags and does not contain focus: preview', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('t');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).not.toContain('focus: tags');
    expect(frame).not.toContain('focus: preview');
  });

  it('4: WHEN \\t (Tab) is written from the initial render THEN the frame contains focus: preview and does not contain focus: tags', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).toContain('focus: preview');
    expect(frame).not.toContain('focus: tags');
  });

  it('5: WHEN \\t then \\t are written THEN the frame does not contain focus: preview', async () => {
    const { lastFrame, stdin } = render(
      <App store={store} width={80} height={24} />
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).not.toContain('focus: preview');
  });
});
