import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { forcedSignOut, logout } from '../../src/core/token';

const SRC = path.resolve(__dirname, '../../src');

// Every file that calls secureWriteFileSync, the count of call sites, the final
// file name(s) it writes and where a leftover `<name>.tmp` is dealt with.
// `root` names are only swept in the data folder; the others also in each account folder.
const WRITERS: Record<string, { sites: number; names: string[]; root?: boolean; tmp: string }> = {
  'src/cli/main.tsx': { sites: 2, names: [], tmp: 'out of scope: crash report, not removed on logout (main.tsx comment "never removes a crash report")' },
  'src/core/account-id.ts': { sites: 1, names: ['account.json'], tmp: 'logout' },
  'src/core/blog-config.ts': { sites: 1, names: ['blog.json'], root: true, tmp: 'logout' },
  'src/core/blog-sent.ts': { sites: 1, names: ['blog-sent.json'], root: true, tmp: 'logout' },
  'src/core/editor-drafts.ts': { sites: 1, names: [], tmp: 'drafts folder' },
  'src/core/editor.ts': { sites: 1, names: [], tmp: 'drafts folder' },
  'src/core/ghost-store.ts': {
    sites: 1,
    names: ['ghosts-account.json', 'ghosts-note.json', 'ghosts-preferences.json', 'ghosts-tag.json'],
    tmp: 'logout',
  },
  'src/core/new-request.ts': { sites: 1, names: ['new-note.request'], tmp: 'logout' },
  'src/core/persistence.ts': { sites: 1, names: ['state.json'], tmp: 'logout' },
  'src/core/sent-changes.ts': { sites: 1, names: ['sent-changes.json'], tmp: 'logout' },
  'src/core/status-file.ts': { sites: 1, names: [], tmp: 'status file' },
  'src/core/tombstones.ts': { sites: 1, names: ['tombstones.json'], tmp: 'logout' },
  'src/core/token.ts': { sites: 1, names: ['auth.json'], root: true, tmp: 'logout' },
  'src/core/unsynced.ts': { sites: 1, names: ['unsynced.json'], tmp: 'logout' },
  'src/core/update-check.ts': { sites: 2, names: [], tmp: 'out of scope: version cache, no secret' },
};

/** Count `secureWriteFileSync(` call sites per file; a file importing it `as` another name counts too. */
function scanWriters(root: string, relBase: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (dir: string, rel: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(abs, r);
      else if (/\.tsx?$/.test(e.name) && r !== 'src/core/secure-fs.ts') {
        const text = fs.readFileSync(abs, 'utf8');
        const calls = text.split('\n').filter((l) => l.includes('secureWriteFileSync(')).length;
        const aliased = /secureWriteFileSync\s+as\s/.test(text) ? 1 : 0;
        if (calls + aliased > 0) out[r] = calls + aliased;
      }
    }
  };
  walk(root, relBase);
  return out;
}

describe('#247a logout removes leftover temp files', () => {
  let tmp: string;
  let dir: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-247a-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(dir);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const w = (rel: string, text: string): void => fs.writeFileSync(path.join(dir, rel), text);
  const r = (rel: string): string => fs.readFileSync(path.join(dir, rel), 'utf8');
  const has = (rel: string): boolean => {
    try {
      fs.lstatSync(path.join(dir, rel));
      return true;
    } catch {
      return false;
    }
  };

  it('1: WHEN a data folder holds `auth.json.tmp` (text `TOKEN-LEFTOVER`), `blog.json.tmp` (text `BLOG-LEFTOVER`), `blog-sent.json.tmp` (text `SENT-LEFTOVER`) and `keep.txt` (text `mine`) and `logout(dir)` runs THEN none of the three `.tmp` files exists and `keep.txt` still holds `mine`', async () => {
    w('auth.json.tmp', 'TOKEN-LEFTOVER');
    w('blog.json.tmp', 'BLOG-LEFTOVER');
    w('blog-sent.json.tmp', 'SENT-LEFTOVER');
    w('keep.txt', 'mine');
    await logout(dir);
    expect([has('auth.json.tmp'), has('blog.json.tmp'), has('blog-sent.json.tmp')]).toEqual([false, false, false]);
    expect(r('keep.txt')).toBe('mine');
  });

  it('2: WHEN the folder holds `auth.json`, `blog.json`, `blog-sent.json` and the three `.tmp` files above and `forcedSignOut(dir)` runs THEN `auth.json`, `auth.json.tmp`, `blog.json` and `blog.json.tmp` do not exist, and `blog-sent.json` and `blog-sent.json.tmp` still hold their text', () => {
    w('auth.json', 'A');
    w('blog.json', 'B');
    w('blog-sent.json', 'SENT');
    w('auth.json.tmp', 'TOKEN-LEFTOVER');
    w('blog.json.tmp', 'BLOG-LEFTOVER');
    w('blog-sent.json.tmp', 'SENT-LEFTOVER');
    forcedSignOut(dir);
    expect([has('auth.json'), has('auth.json.tmp'), has('blog.json'), has('blog.json.tmp')]).toEqual([false, false, false, false]);
    expect(r('blog-sent.json')).toBe('SENT');
    expect(r('blog-sent.json.tmp')).toBe('SENT-LEFTOVER');
  });

  it('3: WHEN `auth.json.tmp` is a symlink to `victim.txt` (outside the folder, text `victim`) and `logout(dir)` runs THEN the link no longer exists and `victim.txt` still holds `victim`', async () => {
    const victim = path.join(tmp, 'victim.txt');
    fs.writeFileSync(victim, 'victim');
    fs.symlinkSync(victim, path.join(dir, 'auth.json.tmp'));
    await logout(dir);
    expect(has('auth.json.tmp')).toBe(false);
    expect(fs.readFileSync(victim, 'utf8')).toBe('victim');
  });

  it('4: WHEN the account sub-folder `a@b.co` holds `auth.json.tmp` (text `x`), `state.json.tmp` (text `y`) and `keep.txt` and `logout(dir)` runs THEN `a@b.co/auth.json.tmp` still holds `x` (the three credential names are root-only) and `a@b.co/state.json.tmp` does not exist', async () => {
    fs.mkdirSync(path.join(dir, 'a@b.co'));
    w('a@b.co/auth.json.tmp', 'x');
    w('a@b.co/state.json.tmp', 'y');
    w('a@b.co/keep.txt', 'mine');
    await logout(dir);
    expect(r('a@b.co/auth.json.tmp')).toBe('x');
    expect(has('a@b.co/state.json.tmp')).toBe(false);
  });

  it('5: WHEN every line of every `.ts` and `.tsx` file under `src/` except `src/core/secure-fs.ts` that contains `secureWriteFileSync(` is counted per file THEN the files and counts equal the `WRITERS` table in the test (15 files, 17 sites at cc551593, listed in FACTS), each row naming where a leftover `<name>.tmp` of that writer is dealt with (`logout`, `forced sign-out`, `drafts folder`, `status file` or `out of scope: <reason>`); a call site in a file not in the table, or one more site in a listed file, fails the test', () => {
    const expected = Object.fromEntries(Object.entries(WRITERS).map(([f, v]) => [f, v.sites]));
    expect(scanWriters(SRC, 'src')).toEqual(expected);
    for (const row of Object.values(WRITERS)) {
      expect(row.tmp).toMatch(/^(logout|forced sign-out|drafts folder|status file|out of scope: .+)/);
    }
  });

  it('6: WHEN, for each `WRITERS` row marked `logout`, its final file name is taken (root names in the data folder, per-account names in the sub-folder `a@b.co`) and `<name>.tmp` (text `LEFTOVER`) is planted there and `logout(dir)` runs THEN none of the planted `.tmp` files exists and the non-empty `keep.txt` beside them still holds `mine`', async () => {
    fs.mkdirSync(path.join(dir, 'a@b.co'));
    w('keep.txt', 'mine');
    w('a@b.co/keep.txt', 'mine');
    const planted: string[] = [];
    for (const row of Object.values(WRITERS)) {
      if (!row.tmp.startsWith('logout')) continue;
      for (const n of row.names) {
        planted.push(`${n}.tmp`);
        w(`${n}.tmp`, 'LEFTOVER');
        if (!row.root) {
          planted.push(`a@b.co/${n}.tmp`);
          w(`a@b.co/${n}.tmp`, 'LEFTOVER');
        }
      }
    }
    expect(planted.length).toBeGreaterThan(10);
    await logout(dir);
    expect(planted.filter(has)).toEqual([]);
    expect(r('keep.txt')).toBe('mine');
    expect(r('a@b.co/keep.txt')).toBe('mine');
  });

  it('7: WHEN `blog.json.tmp` in the data folder is a directory holding `keep.txt` (text `mine`) and `logout(dir)` runs THEN logout resolves without throwing and `blog.json.tmp/keep.txt` still holds `mine`', async () => {
    fs.mkdirSync(path.join(dir, 'blog.json.tmp'));
    w('blog.json.tmp/keep.txt', 'mine');
    await expect(logout(dir)).resolves.not.toThrow();
    expect(r('blog.json.tmp/keep.txt')).toBe('mine');
  });

  it('8: WHEN a scratch file `src/core/zz-alias.ts` imports `secureWriteFileSync` under another name and calls it once THEN the line-5 check reports `src/core/zz-alias.ts` (a write site reached through an alias is not invisible to the WRITERS table)', () => {
    const scratchRoot = path.join(tmp, 'src');
    fs.mkdirSync(path.join(scratchRoot, 'core'), { recursive: true });
    fs.writeFileSync(
      path.join(scratchRoot, 'core', 'zz-alias.ts'),
      "import { secureWriteFileSync as w } from './secure-fs';\nexport const z = (): void => w('/nowhere', 'x');\n",
    );
    expect(Object.keys(scanWriters(scratchRoot, 'src'))).toContain('src/core/zz-alias.ts');
    expect(Object.keys(scanWriters(SRC, 'src'))).not.toContain('src/core/zz-alias.ts');
  });
});
