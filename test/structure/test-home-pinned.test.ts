import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defaultDataDir } from '../../src/core/token.js';
import { documentsDir } from '../../src/core/export-note.js';

const PINNED = [
  'HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DOCUMENTS_DIR',
] as const;

describe('test home pinned to a temp directory', () => {
  it('1: WHEN a test reads process.env THEN `HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_DOCUMENTS_DIR` are all set, all start with `os.tmpdir()`, and are 6 distinct values', () => {
    const tmp = os.tmpdir();
    for (const name of PINNED) {
      const value = process.env[name];
      expect(value).toBeTruthy();
      expect(value!.startsWith(tmp)).toBe(true);
    }
    const values = PINNED.map((name) => process.env[name]);
    expect(new Set(values).size).toBe(6);
  });

  it('2: WHEN `os.homedir()` and `defaultDataDir()` are called THEN both start with `os.tmpdir()`, and `os.homedir()` is not equal to `os.userInfo().homedir`', () => {
    const tmp = os.tmpdir();
    expect(os.homedir().startsWith(tmp)).toBe(true);
    expect(defaultDataDir().startsWith(tmp)).toBe(true);
    expect(os.homedir()).not.toBe(os.userInfo().homedir);
  });

  it('3: WHEN `documentsDir()` is called with no argument THEN it equals `process.env.XDG_DOCUMENTS_DIR`', () => {
    expect(documentsDir()).toBe(process.env.XDG_DOCUMENTS_DIR);
  });

  it('4: WHEN test/setup.ts is read THEN it still contains `SNOTE_UPDATE_CHECK`, `SNOTE_STATUS_DIR`, `SNOTE_EDITOR_DIRECT` and `XDG_DATA_HOME`', () => {
    const setup = readFileSync(path.resolve('test/setup.ts'), 'utf8');
    expect(setup).toContain('SNOTE_UPDATE_CHECK');
    expect(setup).toContain('SNOTE_STATUS_DIR');
    expect(setup).toContain('SNOTE_EDITOR_DIRECT');
    expect(setup).toContain('XDG_DATA_HOME');
  });
});
