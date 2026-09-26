import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import type { EntityId } from '@vendor/types';

// Helper to create branded types for testing
const eid = (id: string): EntityId => id as unknown as EntityId;

describe('Markdown preview', () => {
  let store: ReturnType<typeof makeStore>;
  let markdownNoteId: EntityId;
  let nonMarkdownNoteId: EntityId;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    
    // Create a markdown note
    markdownNoteId = eid('markdown-note');
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: markdownNoteId,
      note: {
        content: '# Title\n\nSome **bold** text',
        systemTags: ['markdown'],
        tags: [],
        deleted: false,
        modificationDate: 1000,
        creationDate: 1000,
      },
    });
    
    // Create a non-markdown note
    nonMarkdownNoteId = eid('non-markdown-note');
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: nonMarkdownNoteId,
      note: {
        content: 'Plain text note\nNo markdown here',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: 2000,
        creationDate: 2000,
      },
    });
  });

  it('1: with the markdown note selected and opened, the frame shows Title and bold but NOT the literal # or ** after pressing v', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for state update
    await new Promise(r => setTimeout(r, 50));
    
    // Move to the markdown note (it's the first one by modificationDate)
    // Actually, the non-markdown note has modificationDate 2000, markdown has 1000
    // So the non-markdown note appears first. Let's move to the second note.
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));
    
    // Initially should show raw content with # Title
    let frame = lastFrame();
    expect(frame).toContain('# Title');
    expect(frame).toContain('**bold**');
    
    // Press v to toggle rendered preview
    stdin.write('v');
    await new Promise((r) => setTimeout(r, 50));
    
    frame = lastFrame();
    // Should show rendered content: Title without #, bold without **
    expect(frame).toContain('Title');
    expect(frame).toContain('bold');
    // The literal markdown syntax should not appear
    expect(frame).not.toContain('# Title');
    expect(frame).not.toContain('**bold**');
  });

  it('2: pressing v again shows the raw content with # Title', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for state update
    await new Promise(r => setTimeout(r, 50));
    
    // Move to the markdown note
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));
    
    // Toggle to rendered
    stdin.write('v');
    await new Promise((r) => setTimeout(r, 50));
    
    let frame = lastFrame();
    expect(frame).toContain('Title');
    expect(frame).not.toContain('# Title');
    
    // Toggle back
    stdin.write('v');
    await new Promise((r) => setTimeout(r, 50));
    
    frame = lastFrame();
    expect(frame).toContain('# Title');
    expect(frame).toContain('**bold**');
  });

  it('3: on a non-markdown note v leaves the frame unchanged', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for state update
    await new Promise(r => setTimeout(r, 50));
    
    // Move to second note (non-markdown)
    stdin.write('j');
    await new Promise((r) => setTimeout(r, 50));
    
    let frame = lastFrame();
    expect(frame).toContain('Plain text note');
    
    // Press v - should not change anything for non-markdown notes
    stdin.write('v');
    await new Promise((r) => setTimeout(r, 50));
    
    frame = lastFrame();
    // Should still show the same content
    expect(frame).toContain('Plain text note');
    expect(frame).toContain('No markdown here');
  });

  it('4: npm run lint:ansi exits 0 on the repo and exits 1 on a temp file containing color="#ff0000"', { timeout: 10000 }, async () => {
    const { spawnSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const script = path.resolve('scripts/lint-ansi.mjs');

    // The repo itself should pass lint:ansi
    const repoResult = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(repoResult.status).toBe(0);

    // Create a temp tree with a violation, lint it, and clean up
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-ansi-test-'));
    try {
      fs.mkdirSync(path.join(tmp, 'src/tui'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'src/tui', 'bad.tsx'), 'const color = "#ff0000";\n');

      const tmpResult = spawnSync(process.execPath, [script], {
        cwd: tmp,
        encoding: 'utf8',
      });
      expect(tmpResult.status).toBe(1);
      expect(tmpResult.stderr).toContain('hex color');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('5: snapshot test at 80x24', async () => {
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} />
    );

    // Wait for state update
    await new Promise(r => setTimeout(r, 50));
    
    // Toggle to rendered mode
    stdin.write('v');
    await new Promise((r) => setTimeout(r, 50));
    
    expect(lastFrame()).toMatchSnapshot('markdown-rendered-80x24');
  });
});
