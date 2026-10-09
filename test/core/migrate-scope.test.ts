/*
 * F105: the one-time legacy migration must move ONLY snote's own pre-T156
 * files (state.json, tombstones.json, ghosts-<bucket>.json and their `.tmp`
 * siblings) out of the data-dir root into `<root>/<email>/`. Before this fix
 * migrateLegacyData swept every plain file in the root that was not
 * auth.json/blog.json/blog-sent.json, so `--data-dir` pointed at a folder
 * with the user's own files silently moved them on the next start.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  migrateLegacyData,
  prepareDataDir,
  saveToken,
} from '../../src/core/token';

// MIX: the fixture every test above is built from (Decisions in the brief).
const MIX: Record<string, string> = {
  'auth.json': JSON.stringify({ email: 'x', token: 'y' }),
  'state.json': 'S',
  'state.json.tmp': 'T',
  'ghosts-note.json': '{}',
  'ghosts-tag.json': '{}',
  'tombstones.json': '[]',
  'keep.txt': 'mine',
  'notes.md': '# notes',
  'state.json.bak': 'BACKUP',
};

const writeRoot = (root: string, files: Record<string, string>): void => {
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), text);
  }
};

describe('migrateLegacyData scope', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-scope-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN the root holds MIX and migrateLegacyData(root, 'a@b.co') runs THEN it returns ['ghosts-note.json', 'ghosts-tag.json', 'state.json', 'state.json.tmp', 'tombstones.json']", () => {
    const root = tmpDir;
    writeRoot(root, MIX);

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual([
      'ghosts-note.json',
      'ghosts-tag.json',
      'state.json',
      'state.json.tmp',
      'tombstones.json',
    ]);
  });

  it("2: WHEN the same runs on MIX THEN the root's sorted entries are exactly ['a@b.co', 'auth.json', 'keep.txt', 'notes.md', 'state.json.bak']", () => {
    const root = tmpDir;
    writeRoot(root, MIX);

    migrateLegacyData(root, 'a@b.co');
    expect([...fs.readdirSync(root)].sort()).toEqual([
      'a@b.co',
      'auth.json',
      'keep.txt',
      'notes.md',
      'state.json.bak',
    ]);
  });

  it("3: WHEN the root holds only auth.json, keep.txt (`keep`) and photos/a.jpg THEN it returns [], <root>/a@b.co does not exist, and keep.txt still holds `keep`", () => {
    const root = tmpDir;
    writeRoot(root, {
      'auth.json': JSON.stringify({ email: 'x', token: 'y' }),
      'keep.txt': 'keep',
    });
    fs.mkdirSync(path.join(root, 'photos'), { recursive: true });
    fs.writeFileSync(path.join(root, 'photos', 'a.jpg'), 'jpg');

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual([]);
    expect(fs.existsSync(path.join(root, 'a@b.co'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('4: WHEN the root holds instance.lock, new-note.request, ghosts-evil.json and a file named with \\x1b]52;c;QQ==\\x07 THEN it returns [] and all four are still in the root', () => {
    const root = tmpDir;
    const escName = '\x1b]52;c;QQ==\x07';
    for (const name of ['instance.lock', 'new-note.request', 'ghosts-evil.json', escName]) {
      fs.writeFileSync(path.join(root, name), 'x');
    }

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual([]);
    const entries = fs.readdirSync(root);
    expect(entries).toContain('instance.lock');
    expect(entries).toContain('new-note.request');
    expect(entries).toContain('ghosts-evil.json');
    expect(entries).toContain(escName);
  });

  it("5: WHEN a token for 'a@b.co' is saved and the root holds state.json ('S') and keep.txt THEN prepareDataDir(root) resolves ['state.json'], a@b.co/state.json holds 'S', keep.txt stays in the root", async () => {
    const root = tmpDir;
    await saveToken(root, { email: 'a@b.co', token: 'tok' });
    fs.writeFileSync(path.join(root, 'state.json'), 'S');
    fs.writeFileSync(path.join(root, 'keep.txt'), 'mine');

    const result = await prepareDataDir(root);
    expect(result).toEqual(['state.json']);
    expect(
      fs.readFileSync(path.join(root, 'a@b.co', 'state.json'), 'utf8'),
    ).toBe('S');
    expect(fs.existsSync(path.join(root, 'keep.txt'))).toBe(true);
  });

  it("6: WHEN <root>/a@b.co/blog.json holds 'B' and the root holds keep.txt THEN the call returns [], <root>/blog.json holds 'B', and keep.txt is still in the root", () => {
    const root = tmpDir;
    fs.mkdirSync(path.join(root, 'a@b.co'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a@b.co', 'blog.json'), 'B');
    fs.writeFileSync(path.join(root, 'keep.txt'), 'mine');

    const result = migrateLegacyData(root, 'a@b.co');
    expect(result).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'blog.json'), 'utf8')).toBe('B');
    expect(fs.existsSync(path.join(root, 'keep.txt'))).toBe(true);
  });
});
