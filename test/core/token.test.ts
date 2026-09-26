import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi, expectTypeOf } from 'vitest';

import { defaultDataDir, saveToken, loadToken, logout } from '../../src/core/token';

describe('token', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-token-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1: WHEN saveToken then saveToken again THEN loadToken returns latest and auth.json has only email and token', async () => {
    const dir = path.join(tmpDir, 'data');
    await saveToken(dir, { email: 'a@b.co', token: 'tok-1' });
    await saveToken(dir, { email: 'a@b.co', token: 'tok-2' });
    const result = await loadToken(dir);
    expect(result).toEqual({ email: 'a@b.co', token: 'tok-2' });
    const authPath = path.join(dir, 'auth.json');
    const keys = Object.keys(JSON.parse(fs.readFileSync(authPath, 'utf8')));
    expect(keys).toEqual(['email', 'token']);
  });

  it('2: WHEN saveToken to missing nested dir THEN auth.json has mode 0o600; WHEN existing auth.json has mode 0o644 THEN saveToken makes it 0o600', async () => {
    // Test saveToken creates missing dir with correct mode
    const deepDir = path.join(tmpDir, 'data', 'new', 'deep');
    await saveToken(deepDir, { email: 'a@b.co', token: 'tok-1' });
    const authPath = path.join(deepDir, 'auth.json');
    const mode1 = fs.statSync(authPath).mode & 0o777;
    expect(mode1).toBe(0o600);

    // Test saveToken corrects existing wrong mode
    const dir = path.join(tmpDir, 'data2');
    fs.mkdirSync(dir, { recursive: true });
    const wrongAuthPath = path.join(dir, 'auth.json');
    fs.writeFileSync(wrongAuthPath, JSON.stringify({ email: 'a@b.co', token: 'tok-1' }), { mode: 0o644 });
    expect(fs.statSync(wrongAuthPath).mode & 0o777).toBe(0o644);
    await saveToken(dir, { email: 'a@b.co', token: 'tok-2' });
    const mode2 = fs.statSync(wrongAuthPath).mode & 0o777;
    expect(mode2).toBe(0o600);
  });

  it('3: WHEN loadToken on empty dir, on bad json, and on missing token key THEN each resolves null and empty dir stays empty', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(await loadToken(emptyDir)).toBeNull();
    expect(fs.readdirSync(emptyDir).length).toBe(0);

    const badJsonDir = path.join(tmpDir, 'bad');
    fs.mkdirSync(badJsonDir, { recursive: true });
    fs.writeFileSync(path.join(badJsonDir, 'auth.json'), 'not json');
    expect(await loadToken(badJsonDir)).toBeNull();

    const partialDir = path.join(tmpDir, 'partial');
    fs.mkdirSync(partialDir, { recursive: true });
    fs.writeFileSync(path.join(partialDir, 'auth.json'), JSON.stringify({ email: 'a@b.co' }));
    expect(await loadToken(partialDir)).toBeNull();
  });

  it('4: WHEN dir holds auth.json, state.json, sub/ghosts-note.json and keep.txt is in root THEN logout(dir) leaves dir empty and keep.txt exists', async () => {
    const dir = path.join(tmpDir, 'data');
    const subDir = path.join(dir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ email: 'a@b.co', token: 'tok' }));
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ version: 1 }));
    fs.writeFileSync(path.join(subDir, 'ghosts-note.json'), JSON.stringify({ version: 1 }));
    const keepPath = path.join(tmpDir, 'keep.txt');
    fs.writeFileSync(keepPath, 'keep');
    await logout(dir);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir).length).toBe(0);
    expect(fs.existsSync(keepPath)).toBe(true);
  });

  it('5: WHEN XDG_DATA_HOME is /x THEN defaultDataDir() is /x/snote; WHEN empty string THEN starts with os.homedir() and ends with .local/share/snote', async () => {
    vi.stubEnv('XDG_DATA_HOME', '/x');
    expect(defaultDataDir()).toBe('/x/snote');

    vi.stubEnv('XDG_DATA_HOME', '');
    const result = defaultDataDir();
    expect(result.startsWith(os.homedir())).toBe(true);
    expect(result.endsWith('.local/share/snote')).toBe(true);
    vi.unstubAllEnvs();
  });

  it('6: WHEN logout runs on missing nested dir THEN it resolves, that dir exists with 0 entries, and loadToken on it resolves null', async () => {
    const missingDir = path.join(tmpDir, 'missing', 'nested');
    expect(fs.existsSync(missingDir)).toBe(false);
    await logout(missingDir);
    expect(fs.existsSync(missingDir)).toBe(true);
    expect(fs.readdirSync(missingDir).length).toBe(0);
    expect(await loadToken(missingDir)).toBeNull();
  });
});
