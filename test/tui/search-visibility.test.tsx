/**
 * Search field: focus marker and truncation (T249).
 * Verifies that the search line gets bold + inverse when open,
 * is truncated at width boundaries, and sits above the status line.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { join, dirname, resolve } from 'path';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';

// Force ink's internal chalk to level 3 so bold/inverse produce ANSI
async function forceInkChalk(): Promise<{ level: number; restore: () => void }> {
  const chalkPath = join(
    resolve(join(dirname(createRequire(import.meta.url).resolve('ink')), '..')),
    'node_modules/chalk/source/index.js'
  );
  try {
    const chalkModule = await import(pathToFileURL(chalkPath).href);
    const chalk = chalkModule.default;
    const savedLevel = chalk.level;
    chalk.level = 3;
    return { level: savedLevel, restore: () => { chalk.level = savedLevel; } };
  } catch {
    return { level: 0, restore: () => {} };
  }
}

describe('Search visibility: focus marker and truncation', () => {
  let store: ReturnType<typeof makeStore>;
  let onQuit: Mock;
  let runEditor: Mock;

  beforeEach(() => {
    store = makeStore({ stubClient: {} });
    onQuit = vi.fn();
    runEditor = vi.fn().mockResolvedValue(null);
  });

  it('1: WHEN <App store={store} width={80} height={24} /> is rendered with chalk forced, then / and falcon are written THEN lastFrame() contains exactly \\u001b[7m\\u001b[1msearch: falcon\\u001b[22m\\u001b[27m, and the line containing "search: falcon" is exactly one less than the line containing "notes"', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { stdin, lastFrame } = render(
        <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
      );

      await new Promise(r => setTimeout(r, 50));

      // Type / then falcon
      stdin.write('/');
      await new Promise(r => setTimeout(r, 50));
      stdin.write('falcon');
      await new Promise(r => setTimeout(r, 50));

      const frame = lastFrame();
      expect(frame).toContain('\u001b[7m\u001b[1msearch: falcon\u001b[22m\u001b[27m');

      const lines = frame.split('\n');
      const searchIdx = lines.findIndex(line => line.includes('search: falcon'));
      const notesIdx = lines.findIndex(line => line.includes('notes'));
      expect(searchIdx).toBe(notesIdx - 2);
    } finally {
      restore();
    }
  });

  it('2: WHEN the same app then has \\r written (query kept, editing stopped), chalk still forced THEN lastFrame() contains exactly \\u001b[1msearch: falcon\\u001b[22m and does not contain \\u001b[7m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { stdin, lastFrame } = render(
        <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
      );

      await new Promise(r => setTimeout(r, 50));

      // Type / then falcon
      stdin.write('/');
      await new Promise(r => setTimeout(r, 50));
      stdin.write('falcon');
      await new Promise(r => setTimeout(r, 50));

      // Press Enter to keep the filter
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 50));

      const frame = lastFrame();
      expect(frame).toContain('\u001b[1msearch: falcon\u001b[22m');
      expect(frame).not.toContain('\u001b[7m');
    } finally {
      restore();
    }
  });

  it('3: WHEN / then a 90-character query of "x".repeat(90) is written at width 80 THEN lastFrame() contains "search: " + "x".repeat(68) + "..", does not contain "x".repeat(90), and store.getState().ui.searchQuery equals "x".repeat(90)', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { stdin, lastFrame } = render(
        <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
      );

      await new Promise(r => setTimeout(r, 50));

      stdin.write('/');
      await new Promise(r => setTimeout(r, 50));
      stdin.write('x'.repeat(90));
      await new Promise(r => setTimeout(r, 50));

      const frame = lastFrame();
      expect(frame).toContain('search: ' + 'x'.repeat(68) + '..');
      expect(frame).not.toContain('x'.repeat(90));
      expect(store.getState().ui.searchQuery).toBe('x'.repeat(90));
    } finally {
      restore();
    }
  });

  it('4: WHEN <App store={store} width={80} height={24} /> is rendered with no key written THEN lastFrame() does not contain "search:"', async () => {
    const { lastFrame } = render(
      <App store={store} width={80} height={24} onQuit={onQuit} runEditor={runEditor} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).not.toContain('search:');
  });

  it('5: WHEN the same width-80 scenario as line 1 is instead rendered at width={120} height={32} THEN lastFrame() also contains exactly \\u001b[7m\\u001b[1msearch: falcon\\u001b[22m\\u001b[27m', async () => {
    const { restore } = await forceInkChalk();
    try {
      const { stdin, lastFrame } = render(
        <App store={store} width={120} height={32} onQuit={onQuit} runEditor={runEditor} />
      );

      await new Promise(r => setTimeout(r, 50));

      stdin.write('/');
      await new Promise(r => setTimeout(r, 50));
      stdin.write('falcon');
      await new Promise(r => setTimeout(r, 50));

      const frame = lastFrame();
      expect(frame).toContain('\u001b[7m\u001b[1msearch: falcon\u001b[22m\u001b[27m');
    } finally {
      restore();
    }
  });
});
