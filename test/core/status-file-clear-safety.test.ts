// (#626): the status rewrite at quit does not follow a link and keeps only the Status keys.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STOPPED_ALIVE, clearUpdateStatusFile } from '../../src/core/status-file';

describe('clearUpdateStatusFile safety', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'status-clear-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN status.json is a symlink to auth.json THEN auth.json is byte-identical, status.json is still that link and the folder holds only those two names', () => {
    const auth = path.join(dir, 'auth.json');
    const text = '{"email":"e@x.test","token":"t0k"}';
    fs.writeFileSync(auth, text);
    fs.symlinkSync(auth, path.join(dir, 'status.json'));
    clearUpdateStatusFile(dir);
    expect(fs.readFileSync(auth, 'utf8')).toBe(text);
    expect(fs.lstatSync(path.join(dir, 'status.json')).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(path.join(dir, 'status.json'))).toBe(auth);
    expect(fs.readdirSync(dir).sort()).toEqual(['auth.json', 'status.json']);
  });

  it('2: WHEN status.json holds the Status keys plus update, token and email THEN it holds exactly the Status keys with alive at the epoch and no token or email', () => {
    const last = { title: 'Groceries', modified: 3000 };
    const synced = '2026-11-03T01:00:00.000Z';
    const file = path.join(dir, 'status.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, count: 2, last, synced, alive: synced, update: 'available', token: 't0k', email: 'e@x.test' }),
    );
    clearUpdateStatusFile(dir);
    const text = fs.readFileSync(file, 'utf8');
    expect(JSON.parse(text)).toEqual({ version: 1, count: 2, last, synced, alive: STOPPED_ALIVE });
    expect(text).not.toContain('t0k');
    expect(text).not.toContain('e@x.test');
  });
});
