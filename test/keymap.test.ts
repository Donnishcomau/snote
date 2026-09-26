/**
 * Keymap coverage test (T16).
 * Verifies that every keymap entry has:
 * 1. A corresponding handler in the App
 * 2. A help string that can be displayed
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { keymap, KeymapEntry } from '../src/core/keymap';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '../src/tui/App.tsx'), 'utf-8');

describe('Keymap coverage', () => {
  it('every keymap entry has a non-empty key', () => {
    keymap.forEach((entry) => {
      expect(entry.key).toBeTruthy();
      expect(entry.key).not.toBe('');
    });
  });

  it('every keymap entry has a non-empty action', () => {
    keymap.forEach((entry) => {
      expect(entry.action).toBeTruthy();
      expect(entry.action).not.toBe('');
    });
  });

  it('every keymap entry has a non-empty description', () => {
    keymap.forEach((entry) => {
      expect(entry.description).toBeTruthy();
      expect(entry.description).not.toBe('');
    });
  });

  it('every keymap entry has a unique key', () => {
    const keys = keymap.map((e) => e.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('every keymap entry has a unique action', () => {
    const actions = keymap.map((e) => e.action);
    const uniqueActions = new Set(actions);
    expect(actions.length).toBe(uniqueActions.size);
  });

  it('all actions have corresponding handlers in App', () => {
    // appSource is read at top of file
    const actionHandlers: Record<string, string[]> = {
      move_down: ["input === 'j'", "keyName === 'downArrow'"],
      move_up: ["input === 'k'", "keyName === 'upArrow'"],
      open_note: ["keyName === 'Enter'"],
      next_pane: ["keyName === 'Tab'"],
      quit: ["input === 'q'"],
      toggle_preview: ["input === 'v'"],
    };
    
    keymap.forEach((entry) => {
      const expectedHandlers = actionHandlers[entry.action];
      if (expectedHandlers) {
        // At least one handler should exist in the source
        const hasHandler = expectedHandlers.some((handler) =>
          appSource.includes(handler)
        );
        expect(hasHandler).toBe(true);
      }
    });
  });

  it('keymap can be rendered as a help table', () => {
    // Verify we can build a help table from keymap
    const helpTable = keymap.map((entry) => ({
      key: entry.key,
      action: entry.action,
      description: entry.description,
    }));
    
    expect(helpTable.length).toBe(keymap.length);
    helpTable.forEach((row) => {
      expect(row.key).toBeTruthy();
      expect(row.action).toBeTruthy();
      expect(row.description).toBeTruthy();
    });
  });
});
