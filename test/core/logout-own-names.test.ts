/**
 * #628: logout removes the instance lock and its takeover marker by their exact
 * names; a user's own file whose name only starts with `instance.lock` stays.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { logout, saveToken } from '../../src/core/token';

describe('#628 logout removes the lock files by exact name', () => {
  let tmp: string;
  let dir: string;
  let sub: string;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-628-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(dir);
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    sub = path.join(dir, 'a@b.co');
    fs.mkdirSync(sub);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN the account folder holds instance.lock, instance.lock.sweep, state.json and the user\'s instance.lock-notes.txt and instance.lock.bak THEN after logout the folder holds exactly [instance.lock-notes.txt, instance.lock.bak] with their bytes', async () => {
    for (const n of ['instance.lock', 'instance.lock.sweep', 'state.json']) fs.writeFileSync(path.join(sub, n), '1');
    fs.writeFileSync(path.join(sub, 'instance.lock-notes.txt'), 'mine\n');
    fs.writeFileSync(path.join(sub, 'instance.lock.bak'), 'bak\n');
    await logout(dir);
    expect(fs.existsSync(sub)).toBe(true);
    expect(fs.readdirSync(sub).sort()).toEqual(['instance.lock-notes.txt', 'instance.lock.bak']);
    expect(fs.readFileSync(path.join(sub, 'instance.lock-notes.txt'), 'utf8')).toBe('mine\n');
    expect(fs.readFileSync(path.join(sub, 'instance.lock.bak'), 'utf8')).toBe('bak\n');
  });

  it('2: WHEN the data folder itself holds instance.lock and instance.lock-notes.txt THEN after logout it holds exactly [instance.lock-notes.txt] and auth.json is gone', async () => {
    fs.rmdirSync(sub);
    fs.writeFileSync(path.join(dir, 'instance.lock'), '1');
    fs.writeFileSync(path.join(dir, 'instance.lock-notes.txt'), 'mine\n');
    await logout(dir);
    expect(fs.readdirSync(dir)).toEqual(['instance.lock-notes.txt']);
  });
});
