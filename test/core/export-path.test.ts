/**
 * #637: the export prompt's typed path. exportTarget splits the typed text at
 * its last `/`, expands only a leading `~`, refuses control and invisible
 * characters; exportTo keeps every existing file and rejects with fixed
 * texts only. The guarantee is the exclusive create, not the resolver.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportFileName } from '../../src/core/export-name';
import { exportTarget, exportTo } from '../../src/core/export-note';
import type { Note } from '@vendor/types';

const note = (content: string): Note => ({ content, tags: [], systemTags: [], creationDate: 1, modificationDate: 1, deleted: false }) as unknown as Note;
const made: string[] = [];
const temp = (name: string): string => {
  const d = mkdtempSync(join(tmpdir(), `export-path-${name}-`));
  made.push(d);
  return d;
};
const env = { home: process.env.HOME, docs: process.env.XDG_DOCUMENTS_DIR };
afterEach(() => {
  if (env.home === undefined) delete process.env.HOME;
  else process.env.HOME = env.home;
  if (env.docs === undefined) delete process.env.XDG_DOCUMENTS_DIR;
  else process.env.XDG_DOCUMENTS_DIR = env.docs;
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});
// HOME and the documents dir both temp dirs, so nothing outside them is touched
const dirs = () => {
  const home = temp('home');
  const docs = temp('docs');
  process.env.HOME = home;
  process.env.XDG_DOCUMENTS_DIR = docs;
  return { home, docs };
};

describe('#637 the export path the user typed', () => {
  it('1: WHEN exportTarget gets `~/x/a.md`, `~`, `notes`, `/abs/d/`, `sub/../b.txt`, `~other/x.md` and `$HOME/x.md` (suggested `S.md`, docs `/D`, home `/H`) THEN it returns /H/x/ a.md, /H S.md, /D notes.md, /abs/d/ S.md, /D/ b.txt, /D/~other x.md and /D/$HOME x.md; WHEN the name is only an extension (`.md`, `~/x/.txt`) THEN `type a file name`, and `.a.md` stays `.a.md`', () => {
    const t = (typed: string) => exportTarget(typed, 'S.md', '/D', '/H');
    expect(t('~/x/a.md')).toEqual({ dir: '/H/x/', name: 'a.md' });
    expect(t('~')).toEqual({ dir: '/H', name: 'S.md' });
    expect(t('notes')).toEqual({ dir: '/D', name: 'notes.md' });
    expect(t('/abs/d/')).toEqual({ dir: '/abs/d/', name: 'S.md' });
    expect(t('sub/../b.txt')).toEqual({ dir: '/D/', name: 'b.txt' });
    expect(t('~other/x.md')).toEqual({ dir: '/D/~other/', name: 'x.md' });
    expect(t('$HOME/x.md')).toEqual({ dir: '/D/$HOME/', name: 'x.md' });
    expect(t('.md')).toEqual({ error: 'type a file name' });
    expect(t('~/x/.txt')).toEqual({ error: 'type a file name' });
    expect(t('.a.md')).toEqual({ dir: '/D', name: '.a.md' });
  });

  it('2: WHEN the typed path ends in `/..` or `/.` THEN exportTo rejects with `type a file name` and the home and documents dirs list the same entries before and after', async () => {
    const { home, docs } = dirs();
    mkdirSync(join(docs, 'sub'));
    for (const typed of ['~/Documents/sub/..', `${docs}/sub/..`, `${docs}/sub/.`]) {
      await expect(exportTo(note('# Plan'), typed)).rejects.toThrow(/^type a file name$/);
    }
    expect(readdirSync(home)).toEqual([]);
    expect(readdirSync(docs)).toEqual(['sub']);
    expect(readdirSync(join(docs, 'sub'))).toEqual([]);
  });

  it('3: WHEN the typed name holds a NUL, an escape, U+202E, a tab or U+061C THEN exportTo rejects with `the path has a character snote cannot write` and the documents dir stays empty', async () => {
    const { docs } = dirs();
    for (const typed of ['a\u0000b.md', 'a\u001b[31mb.md', 'report‮dm.md', 'x\ty.md', 'a؜b.md', `${docs}​/x.md`]) {
      await expect(exportTo(note('# Plan'), typed)).rejects.toThrow(/^the path has a character snote cannot write$/);
    }
    expect(readdirSync(docs)).toEqual([]);
  });

  it('4: WHEN exportFileName gets `a\\u061Cb` THEN it returns `ab`', () => {
    expect(exportFileName('a؜b')).toBe('ab');
  });

  it('5: WHEN the typed name is an existing file, a dangling symlink or a hard link THEN the note lands at `<name> 2.md` and the old bytes, the link and its target are unchanged; the mode is 0o666 less the umask', async () => {
    const { docs } = dirs();
    const outside = temp('outside');
    writeFileSync(join(docs, 'keep.md'), 'old');
    symlinkSync(join(outside, 'victim.txt'), join(docs, 'link.md'));
    writeFileSync(join(outside, 'h.txt'), 'theirs');
    linkSync(join(outside, 'h.txt'), join(docs, 'hard.md'));
    expect(await exportTo(note('# Plan\nnew'), 'keep.md')).toBe(join(docs, 'keep 2.md'));
    expect(await exportTo(note('# Plan\nnew'), 'link.md')).toBe(join(docs, 'link 2.md'));
    expect(await exportTo(note('# Plan\nnew'), 'hard.md')).toBe(join(docs, 'hard 2.md'));
    expect(readFileSync(join(docs, 'keep.md'), 'utf8')).toBe('old');
    expect(readFileSync(join(outside, 'h.txt'), 'utf8')).toBe('theirs');
    expect(existsSync(join(outside, 'victim.txt'))).toBe(false);
    expect(readFileSync(join(docs, 'keep 2.md'), 'utf8')).toBe('# Plan\nnew');
    const umask = process.umask();
    expect(lstatSync(join(docs, 'keep 2.md')).mode & 0o777).toBe(0o666 & ~umask);
  });

  it('6: WHEN the folder is missing, is a file, or the name is 300 bytes THEN exportTo rejects with `folder does not exist: <folder>`, `not a folder: <folder>` or `the file name is too long`, no folder is made and no message holds `open \'`', async () => {
    const { docs } = dirs();
    writeFileSync(join(docs, 'f'), 'x');
    const errs: string[] = [];
    for (const typed of ['nope/x.md', 'f/x.md', `${'n'.repeat(300)}.md`]) {
      errs.push(await exportTo(note('# Plan'), typed).then(() => 'written', (e: Error) => e.message));
    }
    expect(errs).toEqual([`folder does not exist: ${join(docs, 'nope/')}`, `not a folder: ${join(docs, 'f/')}`, 'the file name is too long']);
    expect(readdirSync(docs)).toEqual(['f']);
    expect(errs.join('\n')).not.toContain("open '");
  });

  it('7: WHEN the typed path is `~/x.md` THEN the file is written in HOME; WHEN it is `~other/x.md` THEN it rejects with the missing-folder text and HOME stays empty', async () => {
    const { home, docs } = dirs();
    expect(await exportTo(note('# Plan'), '~/x.md')).toBe(join(home, 'x.md'));
    rmSync(join(home, 'x.md'));
    await expect(exportTo(note('# Plan'), '~other/x.md')).rejects.toThrow(`folder does not exist: ${join(docs, '~other/')}`);
    expect(readdirSync(home)).toEqual([]);
  });

  it('8: WHEN the typed name holds U+FEFF, U+2060, U+00AD or a tag character, or a family emoji (U+200D inside), THEN exportTo rejects with `the path has a character snote cannot write` and writes nothing; a heart with U+FE0F is written as typed; exportFileName drops U+FEFF, U+2060 and U+200D', async () => {
    const { docs } = dirs();
    for (const typed of ['a\uFEFFb.md', 'a\u2060b.md', 'a\u00ADb.md', 'a\u{E0041}b.md', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}.md', 'a\u200Db.md']) {
      await expect(exportTo(note('# Plan'), typed)).rejects.toThrow(/^the path has a character snote cannot write$/);
    }
    expect(readdirSync(docs)).toEqual([]);
    expect(await exportTo(note('# Plan'), '\u2764\uFE0F.md')).toBe(join(docs, '\u2764\uFE0F.md'));
    expect(exportFileName('a\uFEFFb\u2060c\u200Dd')).toBe('abcd');
  });
});
