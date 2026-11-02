/**
 * #194: auth.json and blog.json are written without following a symlink.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { saveToken, loadToken } from '../../src/core/token';
import { saveBlogConfig, loadBlogConfig } from '../../src/core/blog-config';

let root: string;
let dir: string;
let victim: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-tokfollow-'));
  dir = path.join(root, 'data');
  fs.mkdirSync(dir);
  victim = path.join(root, 'victim.txt');
  fs.writeFileSync(victim, 'victim-original');
  fs.chmodSync(victim, 0o644);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const victimIntact = (): boolean =>
  fs.readFileSync(victim, 'utf8') === 'victim-original' && (fs.statSync(victim).mode & 0o777) === 0o644;

const isRegular0600 = (name: string): boolean => {
  const st = fs.lstatSync(path.join(dir, name));
  return st.isFile() && (st.mode & 0o777) === 0o600;
};

describe('#194 token files', () => {
  it('1: WHEN a symlink sits at auth.json, and then at auth.json.tmp, THEN saveToken writes the token to a regular `0600` auth.json, leaves no auth.json.tmp and the link target is unchanged', async () => {
    fs.symlinkSync(victim, path.join(dir, 'auth.json'));
    await saveToken(dir, { email: 'a@b.invalid', token: 'tok-1' });
    expect(victimIntact()).toBe(true);
    expect(isRegular0600('auth.json')).toBe(true);
    expect(await loadToken(dir)).toMatchObject({ email: 'a@b.invalid', token: 'tok-1' });
    fs.symlinkSync(victim, path.join(dir, 'auth.json.tmp'));
    await saveToken(dir, { email: 'a@b.invalid', token: 'tok-2' });
    expect(victimIntact()).toBe(true);
    expect(fs.existsSync(path.join(dir, 'auth.json.tmp'))).toBe(false);
    expect(isRegular0600('auth.json')).toBe(true);
    expect(await loadToken(dir)).toMatchObject({ token: 'tok-2' });
  });

  it('2: WHEN a symlink sits at blog.json THEN saveBlogConfig writes a regular `0600` blog.json and the link target is unchanged', async () => {
    fs.symlinkSync(victim, path.join(dir, 'blog.json'));
    await saveBlogConfig(dir, { origin: 'https://blog.invalid', token: 'blog-tok' });
    expect(victimIntact()).toBe(true);
    expect(isRegular0600('blog.json')).toBe(true);
    expect(await loadBlogConfig(dir)).toMatchObject({ token: 'blog-tok' });
  });
});
