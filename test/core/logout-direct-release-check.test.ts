/**
 * Logout removes a direct install's release-check cache and leaves the user's other file.
 * The cache name is the literal the writer in src/core/direct-download.ts uses.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { logout } from '../../src/core/token';

const NAME = 'direct-release-check.json';

describe('logout removes the direct release-check cache and keeps the user file', () => {
  let dir = '';

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN a data folder holds `direct-release-check.json` and `keep.txt` and logout runs on it THEN the check file is gone and `keep.txt` still holds `mine`', async () => {
    const writer = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'direct-download.ts'), 'utf8');
    expect(writer).toContain(`'${NAME}'`);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-logout-check-'));
    fs.writeFileSync(path.join(dir, NAME), '{}');
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine');
    await logout(dir);
    expect([fs.existsSync(path.join(dir, NAME)), fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')]).toEqual([false, 'mine']);
  });
});
