import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { accountDir, migrateLegacyData, prepareDataDir } from '../../src/core/token';
import { loadToken } from '../../src/core/token';

describe('accountDir', () => {
  it("1: WHEN accountDir('/r', ' Ann.B+x@Example.COM ') is called THEN it returns '/r/ann.b+x@example.com', and fs.existsSync of it is false", () => {
    const result = accountDir('/r', ' Ann.B+x@Example.COM ');
    expect(result).toBe('/r/ann.b+x@example.com');
    expect(fs.existsSync(result)).toBe(false);
  });

  it("2: WHEN accountDir('/r', '../evil/a@b.co'), accountDir('/r', '..') and accountDir('/r', '') are called THEN they return '/r/.._evil_a@b.co', '/r/_' and '/r/_'", () => {
    expect(accountDir('/r', '../evil/a@b.co')).toBe('/r/.._evil_a@b.co');
    expect(accountDir('/r', '..')).toBe('/r/_');
    expect(accountDir('/r', '')).toBe('/r/_');
  });
});

describe('migrateLegacyData', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-migrate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("3: WHEN the root holds auth.json, state.json (text 'S'), ghosts-note.json and a folder 'old/', and migrateLegacyData(root, 'a@b.co') runs THEN it returns ['ghosts-note.json', 'state.json'], <root>/a@b.co/state.json has the text 'S', and the root keeps only auth.json and old", () => {
    const root = tmpDir;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'auth.json'), JSON.stringify({ email: 'x', token: 'y' }));
    fs.writeFileSync(path.join(root, 'state.json'), 'S');
    fs.writeFileSync(path.join(root, 'ghosts-note.json'), '{}');
    fs.mkdirSync(path.join(root, 'old'), { recursive: true });

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual(['ghosts-note.json', 'state.json']);

    const acctState = path.join(root, 'a@b.co', 'state.json');
    expect(fs.existsSync(acctState)).toBe(true);
    expect(fs.readFileSync(acctState, 'utf8')).toBe('S');

    const rootFiles = fs.readdirSync(root);
    expect(rootFiles).toContain('auth.json');
    expect(rootFiles).toContain('old');
    expect(rootFiles).not.toContain('state.json');
    expect(rootFiles).not.toContain('ghosts-note.json');
  });

  it("4a: WHEN the root holds only auth.json, THEN migrateLegacyData(root, 'a@b.co') returns [] and <root>/a@b.co does not exist", () => {
    const root = tmpDir;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'auth.json'), JSON.stringify({ email: 'x', token: 'y' }));

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual([]);
    expect(fs.existsSync(path.join(root, 'a@b.co'))).toBe(false);
  });

  it("4b: WHEN the root does not exist, THEN migrateLegacyData(root, 'a@b.co') returns [] and nothing is created", () => {
    const nonExistent = path.join(tmpDir, 'nonexistent');
    const result = migrateLegacyData(nonExistent, 'a@b.co');
    expect(result).toEqual([]);
    expect(fs.existsSync(nonExistent)).toBe(false);
  });

  it("5: WHEN <root>/a@b.co/state.json already holds 'NEW' and the root holds 'state.json' with 'OLD' THEN after the call the account file still has 'NEW', the root file still has 'OLD', and the result is []", () => {
    const root = tmpDir;
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, 'a@b.co'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a@b.co', 'state.json'), 'NEW');
    fs.writeFileSync(path.join(root, 'auth.json'), JSON.stringify({ email: 'x', token: 'y' }));
    fs.writeFileSync(path.join(root, 'state.json'), 'OLD');

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'a@b.co', 'state.json'), 'utf8')).toBe('NEW');
    expect(fs.readFileSync(path.join(root, 'state.json'), 'utf8')).toBe('OLD');
  });
});

describe('prepareDataDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-prepare-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("6a: WHEN a token for 'a@b.co' was saved and the root holds state.json THEN await prepareDataDir(root) resolves ['state.json'] and loadToken(root) still has the token", async () => {
    const root = tmpDir;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'auth.json'), JSON.stringify({ email: 'a@b.co', token: 'tok' }));
    fs.writeFileSync(path.join(root, 'state.json'), 'some-state');

    const result = await prepareDataDir(root);
    expect(result).toEqual(['state.json']);

    const token = await loadToken(root);
    expect(token).toEqual({ email: 'a@b.co', token: 'tok' });
  });

  it("6b: WHEN there is NO auth.json THEN prepareDataDir(root) resolves [] and state.json stays in the root", async () => {
    const root = tmpDir;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'state.json'), 'some-state');

    const result = await prepareDataDir(root);
    expect(result).toEqual([]);
    expect(fs.readdirSync(root)).toContain('state.json');
  });
});
