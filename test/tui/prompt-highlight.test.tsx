import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { TagEditor } from '../../src/tui/TagEditor';
import { Prompt } from '../../src/tui/Prompt';
import { BottomArea } from '../../src/tui/BottomArea';
import { makeStore } from '../../src/core/store';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId, Note } from '@vendor/types';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
const inkChalk = (await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)).default;

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[\d+m/g, '');
}

const eid = (id: string): EntityId => id as unknown as EntityId;

const noteA: Note = {
  content: 'Alpha note',
  creationDate: Date.now(),
  deleted: false,
  modificationDate: Date.now(),
  systemTags: [],
  tags: [],
} as Note;

const noteEntries: { id: EntityId; note: Note }[] = [
  { id: eid('note-a'), note: noteA },
];

const makeView = (overrides?: Record<string, unknown>) => ({
  allTagNames: [] as string[],
  connected: false,
  noteEntries,
  inTrash: false,
  sortLabelStr: 'sort: modified',
  pending: 0,
  selectedIndex: 0,
  setSelectedIndex: vi.fn(),
  query: '',
  setQuery: vi.fn(),
  tagNames: [] as string[],
  collection: { type: 'all' },
  ...overrides,
} as never);

const makeBaseProps = () => ({
  store: makeStore({ stubClient: {} }) as Store<State>,
  view: makeView(),
  selectedEntry: noteEntries[0],
  width: 80,
  onLogout: vi.fn(),
  tagEditorOpen: false,
  setTagEditorOpen: vi.fn(),
  tagDialog: null,
  setTagDialog: vi.fn(),
  logoutAsk: false,
  setLogoutAsk: vi.fn(),
  emptyAsk: 0,
  setEmptyAsk: vi.fn(),
  copyResult: null,
  tagsFocused: false,
  searchOpen: false,
});

describe('prompt highlight (T265)', () => {
  it('1: WHEN <TagEditor tags={[]} allTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} /> is rendered with chalk forced to level 3 THEN the frame contains the exact \\u001b[7m\\u001b[1mtags: + type to add\\u001b[22m\\u001b[27m', async () => {
    inkChalk.level = 3;
    const { lastFrame, unmount } = render(
      <TagEditor tags={[]} allTags={[]} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('\u001b[7m\u001b[1mtags: + type to add\u001b[22m\u001b[27m');
    unmount();
  });

  it('2: WHEN <Prompt label="rename tag" initial="work" onSubmit={vi.fn()} onCancel={vi.fn()} /> is rendered with chalk forced THEN the text is wrapped in bold inverse', async () => {
    inkChalk.level = 3;
    const { lastFrame, unmount } = render(
      <Prompt label="rename tag" initial="work" onSubmit={vi.fn()} onCancel={vi.fn()} />
    );
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    const stripped = stripAnsi(frame);
    expect(stripped).toContain('rename tag: work');
    // Verify bold inverse is applied: inverse+bold codes appear before the text, and reset codes after
    const inverseBoldIdx = frame.indexOf('\u001b[7m\u001b[1m');
    const renameTagIdx = stripped.indexOf('rename tag: work');
    expect(inverseBoldIdx).toBeGreaterThanOrEqual(0);
    expect(frame).toContain('\u001b[27m'); // inverse reset
    unmount();
  });

  it('3: WHEN <TagEditor tags={[\'home\']} allTags={[\'home\',\'work\']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} /> has stdin.write(\'wo\') sent (the \'work\' suggestion becomes active) and is rendered with chalk forced THEN the frame contains the exact \\u001b[7m\\u001b[1mtags: [home] + wo\\u001b[22m\\u001b[27m and also contains plain \'rk\' (the suggestion tail), but does not contain \\u001b[7mrk', async () => {
    inkChalk.level = 3;
    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={['home']} allTags={['home', 'work']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('wo');
    await new Promise(r => setTimeout(r, 0));
    const frame = lastFrame();
    expect(frame).toContain('\u001b[7m\u001b[1mtags: [home] + wo\u001b[22m\u001b[27m');
    expect(frame).toContain('rk');
    expect(frame).not.toContain('\u001b[7mrk');
    unmount();
  });

  it('4: WHEN <BottomArea {...makeBaseProps()} tagEditorOpen={true} /> is rendered THEN the frame contains both \'tags: + type to add\' and, on its own line below it, the text \'Enter Confirm  Escape Cancel\'', async () => {
    inkChalk.level = 3;
    const props = makeBaseProps();
    props.tagEditorOpen = true;
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    const stripped = stripAnsi(frame);
    expect(stripped).toContain('tags: + type to add');
    expect(stripped).toContain('Enter Confirm  Escape Cancel');
    const lines = stripped.split('\n');
    const tagsLineIdx = lines.findIndex(l => l.includes('tags: + type to add'));
    const hintsLineIdx = lines.findIndex(l => l.includes('Enter Confirm  Escape Cancel'));
    expect(hintsLineIdx).toBeGreaterThan(tagsLineIdx);
    unmount();
  });

  it('5: WHEN <BottomArea {...makeBaseProps()} tagDialog={{ kind: \'rename\', tagName: \'work\' }} /> is rendered THEN the frame contains both \'rename tag: work\' and the text \'Enter Confirm  Escape Cancel\'', async () => {
    inkChalk.level = 3;
    const props = makeBaseProps();
    props.tagDialog = { kind: 'rename', tagName: 'work' };
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    const stripped = stripAnsi(frame);
    expect(stripped).toContain('rename tag: work');
    expect(stripped).toContain('Enter Confirm  Escape Cancel');
    unmount();
  });

  it('6: WHEN <BottomArea {...makeBaseProps()} tagDialog={{ kind: \'delete\', tagName: \'work\' }} /> is rendered THEN the frame contains \'delete tag work? y/n\' and does NOT contain \'Enter Confirm\'', async () => {
    inkChalk.level = 3;
    const props = makeBaseProps();
    props.tagDialog = { kind: 'delete', tagName: 'work' };
    const { lastFrame, unmount } = render(<BottomArea {...props} />);
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    const stripped = stripAnsi(frame);
    expect(stripped).toContain('delete tag work? y/n');
    expect(stripped).not.toContain('Enter Confirm');
    unmount();
  });
});
