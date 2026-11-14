/**
 * #717 the list shortcut line names j/k; #720 the inline editor footer names
 * the time of its last autosave; #721 markdown headings take a colour per
 * level (# blue, ## magenta, ### to ###### cyan) in the Preview and the
 * inline editor. Colours are read with Ink's chalk forced to level 3.
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { render } from 'ink-testing-library';
import React from 'react';

import KeyHints from '../../src/tui/KeyHints';
import Preview from '../../src/tui/Preview';
import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';
import { clockTime } from '../../src/core/last-sync';
import { headingLevel } from '../../src/core/md-inline';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId, SystemTag } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const strip = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');

async function forceInkChalk(): Promise<() => void> {
  const inkPkgDir = dirname(dirname(createRequire(import.meta.url).resolve('ink')));
  const inkChalk = (await import(pathToFileURL(join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)).default;
  const saved = inkChalk.level;
  inkChalk.level = 3;
  return () => {
    inkChalk.level = saved;
  };
}

async function openInline(content: string, systemTags: SystemTag[] = []) {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content, systemTags, tags: [], deleted: false, modificationDate: 2000, creationDate: 1000 },
  });
  const r = render(<App store={store} width={80} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, content.split('\n')[0]);
  r.stdin.write('i');
  await waitForFrame(r.lastFrame, 'Autosaves · Esc close · Ctrl+S save now');
  return { ...r, store };
}

describe('0.2.12 editor UI (#717 #720 #721)', () => {
  it('1: (#717) WHEN <KeyHints context="list" width={80} /> renders, with no pin and with pin `Unpin` THEN the line holds `j/k Move`; with no pin it also holds `←→ Panes`; at width 60 it holds `Tab Tags` and not `j/k Move`', () => {
    const plain = render(<KeyHints context="list" width={80} />);
    expect(strip(plain.lastFrame() ?? '')).toContain('q Quit  Tab Tags  j/k Move  ←→ Panes');
    plain.unmount();
    const pinned = render(<KeyHints context="list" width={80} pin="Unpin" />);
    expect(strip(pinned.lastFrame() ?? '')).toContain('Tab Tags  j/k Move');
    pinned.unmount();
    const narrow = render(<KeyHints context="list" width={60} />);
    expect(strip(narrow.lastFrame() ?? '')).toContain('Tab Tags');
    expect(strip(narrow.lastFrame() ?? '')).not.toContain('j/k Move');
    narrow.unmount();
  });

  it('2: (#721) WHEN headingLevel reads `# a`, `## a`, `###### a`, `####### a`, `#a` and `a` THEN it returns 1, 2, 6, 0, 0 and 0', () => {
    expect(['# a', '## a', '###### a', '####### a', '#a', 'a'].map(headingLevel)).toEqual([1, 2, 6, 0, 0, 0]);
  });

  it('3: (#721) WHEN a markdown note with `# One`, `## Two`, `### Three` and `###### Six` renders in the Preview THEN each heading is bold in blue, magenta, cyan and cyan', async () => {
    const restore = await forceInkChalk();
    try {
      const note = makeNote('h', 'Title\n# One\n## Two\n### Three\n###### Six\nplain', { markdown: true });
      const r = render(<Preview note={note} width={80} height={24} rendered={true} />);
      const frame = await waitForFrame(r.lastFrame, 'plain');
      expect(frame).toContain('\u001b[1m\u001b[34mOne');
      expect(frame).toContain('\u001b[1m\u001b[35mTwo');
      expect(frame).toContain('\u001b[1m\u001b[36mThree');
      expect(frame).toContain('\u001b[1m\u001b[36mSix');
      expect(frame).toContain('\u001b[22mplain');
      r.unmount();
    } finally {
      restore();
    }
  });

  it('4: (#721) WHEN a markdown note with `# One` and `## Two` is open in the inline editor THEN `# One` is drawn blue and `## Two` magenta', async () => {
    const restore = await forceInkChalk();
    try {
      const r = await openInline('Plan\n# One\n## Two', ['markdown']);
      const frame = await waitForFrame(r.lastFrame, (f) => f.includes('\u001b[35m') && f.includes('\u001b[34m'));
      expect(frame).toMatch(/\u001b\[34m(\u001b\[[0-9;]*m)*# One/);
      expect(frame).toMatch(/\u001b\[35m(\u001b\[[0-9;]*m)*## Two/);
      r.unmount();
    } finally {
      restore();
    }
  });

  it('5: (#720) WHEN `Z` is typed in the inline editor and the autosave stores it THEN the footer reads `Autosaved at HH:MM · Esc close · Ctrl+S save` with the time of the store, and no longer `Autosaves`', async () => {
    const before = Date.now();
    const r = await openInline('hello world');
    r.stdin.write('Z');
    const frame = await waitForFrame(r.lastFrame, 'Autosaved at ', 3000);
    const after = Date.now();
    expect(r.store.getState().data.notes.get(eid('t1'))?.content).toBe('hello worldZ');
    const shown = /Autosaved at (\d\d:\d\d) · Esc close · Ctrl\+S save/.exec(frame)?.[1];
    expect([clockTime(before), clockTime(after)]).toContain(shown);
    expect(frame).not.toContain('Autosaves');
    r.unmount();
  }, 10000);

  it('6: (#721) WHEN a markdown note `Plan`, `#`, `body`, `# One` is open in the inline editor THEN `# One` is drawn blue and `body` takes no colour', async () => {
    const restore = await forceInkChalk();
    try {
      const r = await openInline('Plan\n#\nbody\n# One', ['markdown']);
      const frame = await waitForFrame(r.lastFrame, '# One');
      expect(frame).toMatch(/\u001b\[34m(\u001b\[[0-9;]*m)*# One/);
      const bodyRow = frame.split('\n').find((row) => strip(row).includes('body')) ?? '';
      expect(strip(bodyRow)).toContain('body');
      expect(bodyRow).not.toMatch(/\u001b\[3[456]m(\u001b\[[0-9;]*m)*b/);
      r.unmount();
    } finally {
      restore();
    }
  });

  it('7: (#721) WHEN a plain (not markdown) note `Plan`, `# One`, `## Two` is open in the inline editor THEN neither line is drawn in a heading colour', async () => {
    const restore = await forceInkChalk();
    try {
      const r = await openInline('Plan\n# One\n## Two');
      const frame = await waitForFrame(r.lastFrame, (f) => strip(f).includes('## Two'));
      expect(strip(frame)).toContain('## Two');
      expect(frame).not.toMatch(/\u001b\[3[456]m(\u001b\[[0-9;]*m)*#/);
      r.unmount();
    } finally {
      restore();
    }
  });
});
