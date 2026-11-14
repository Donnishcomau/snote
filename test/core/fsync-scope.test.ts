/**
 * #682: secureWriteFileSync fsyncs every write unless the caller passes `{ durable: false }`, and only three
 * kinds of file pass it: status.json, new-note.request and the update-check caches, whose loss on a crash
 * costs nothing. Note data (state.json) and every other writer keep the fsync. test/setup.ts counts fsync
 * calls (#656), so each case reads the count before and after one write.
 */
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { secureWriteFileSync } from '../../src/core/secure-fs';
import { writeStatusFile, type Status } from '../../src/core/status-file';
import { requestNewNote } from '../../src/core/new-request';
import { saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { trackUnsynced } from '../../src/core/unsynced';
import { createSentChanges } from '../../src/core/sent-changes';
import { saveTombstones } from '../../src/core/tombstones';
import { FileGhostStore } from '../../src/core/ghost-store';
import { saveToken } from '../../src/core/token';
import { writeSource, setDraftsDir } from '../../src/core/editor-drafts';
import { editInEditor } from '../../src/core/editor';
import { recordAccountId } from '../../src/core/account-id';
import { saveBlogConfig } from '../../src/core/blog-config';
import { recordBlogSend } from '../../src/core/blog-sent';
import { checkRemoteUpdate, checkRemoteVersion, type GitRunner } from '../../src/core/update-check';
import { directNewest } from '../../src/core/direct-download';
import { main } from '../../src/cli/main';

type Stub = { calls: number };
const calls = (): number => (fs.fsyncSync as unknown as Stub).calls;
const dirs: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'snote-682-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  setDraftsDir(null);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * Every `durable` in src (any case, any spacing or quoting around it), by file: secure-fs.ts holds the option
 * (doc, type, check) and the three writers allowed to skip the fsync pass it. A new use anywhere changes a count.
 */
const ALLOWED: Record<string, number> = {
  'src/core/direct-download.ts': 1,
  'src/core/new-request.ts': 1,
  'src/core/secure-fs.ts': 3,
  'src/core/status-file.ts': 1,
  'src/core/update-check.ts': 2,
};
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

type Written = { dir: string; name: string };
const one = (dir: string, name: string): Written[] => [{ dir, name }];
/** Every data writer but state.json (test 3): it runs once and returns the files it wrote. */
const DATA_WRITERS: Array<[string, string, (d: string) => Promise<Written[]>]> = [
  ['unsynced and held-notes', 'unsynced.ts', async (d) => {
    const state = { simperium: { pendingNotes: { n1: 'dirty' } }, data: { notes: new Map([['n1', { content: 'x', modificationDate: 5 }]]) } };
    trackUnsynced({ getState: () => state as never, subscribe: () => () => {} }, d).settle();
    return [...one(d, 'state.json'), ...one(d, 'unsynced-notes.json'), ...one(d, 'unsynced.json')]; // state.json too: none on disk yet
  }],
  ['sent-changes', 'sent-changes.ts', async (d) => (createSentChanges(d).sent('n1', 'c1'), one(d, 'sent-changes.json'))],
  ['tombstones', 'tombstones.ts', async (d) => (saveTombstones(d, ['n1']), one(d, 'tombstones.json'))],
  ['ghosts', 'ghost-store.ts', async (d) => (await new FileGhostStore(d, 'note').put('n1', 1, {}), one(d, 'ghosts-note.json'))],
  ['token', 'token.ts', async (d) => (await saveToken(d, { email: 'a@b.invalid', token: 't' }), one(d, 'auth.json'))],
  ['account', 'account-id.ts', async (d) => (recordAccountId(d, 'a@b.invalid'), one(d, 'account.json'))],
  ['drafts source', 'editor-drafts.ts', async (d) => (writeSource(d, 'n1', 'text'), one(d, 'source.json'))],
  ['blog config', 'blog-config.ts', async (d) => (await saveBlogConfig(d, { origin: 'https://blog.invalid', token: 't' }), one(d, 'blog.json'))],
  ['blog sent', 'blog-sent.ts', async (d) => (recordBlogSend(d, 'n1', { postId: 1, url: 'https://blog.invalid/p/1', sentAt: 1 } as never), one(d, 'blog-sent.json'))],
  ['editor', 'editor.ts', async (d) => {
    const editor = join(d, 'editor.sh'); // copies the file it opens, then exits unchanged (snote then removes its folder)
    writeFileSync(editor, `#!/bin/sh\ncp "$1" "${d}/opened.md"\n`, { mode: 0o755 });
    setDraftsDir(join(d, 'drafts'));
    await editInEditor('hello', { editor });
    return one(d, 'opened.md');
  }],
  ['report', 'main.tsx', async (d) => {
    const state = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = join(d, 'state');
    try {
      await main(['--report', '--data-dir', join(d, 'data')], { log: () => {} });
    } finally {
      if (state === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = state;
    }
    const dir = join(d, 'state', 'snote');
    return readdirSync(dir).filter((n) => n.startsWith('report-')).map((name) => ({ dir, name }));
  }],
];
/**
 * Every secureWriteFileSync( in src by file: the definition, the data writers (tests 3 and 5), the writers that skip
 * the fsync (tests 2 and 6) and main.tsx's crash bundle (a spawned process, so no counted case). A new call site
 * changes a count, and its file gets a case in test 5 or 6 in the same change.
 */
const CALL_SITES: Record<string, number> = {
  'src/cli/main.tsx': 2,
  'src/core/account-id.ts': 1,
  'src/core/blog-config.ts': 1,
  'src/core/blog-sent.ts': 1,
  'src/core/direct-download.ts': 1,
  'src/core/editor-drafts.ts': 1,
  'src/core/editor.ts': 1,
  'src/core/ghost-store.ts': 1,
  'src/core/new-request.ts': 1,
  'src/core/persistence.ts': 1,
  'src/core/secure-fs.ts': 1,
  'src/core/sent-changes.ts': 1,
  'src/core/star-prompt.ts': 1,
  'src/core/status-file.ts': 1,
  'src/core/token.ts': 1,
  'src/core/tombstones.ts': 1,
  'src/core/unsynced.ts': 1,
  'src/core/update-check.ts': 2,
};

describe('#682: only files whose loss costs nothing skip the fsync', () => {
  it('1: WHEN secureWriteFileSync is given { durable: false } THEN no fsync runs, the file holds the data at mode 0600 and no .tmp is left', () => {
    const d = scratch();
    const before = calls();
    secureWriteFileSync(join(d, 'a.json'), '{"a":1}', { durable: false });
    expect({
      calls: calls() - before,
      data: readFileSync(join(d, 'a.json'), 'utf8'),
      mode: statSync(join(d, 'a.json')).mode & 0o777,
      left: readdirSync(d),
    }).toEqual({ calls: 0, data: '{"a":1}', mode: 0o600, left: ['a.json'] });
  });

  it('2: WHEN snote writes status.json or a new-note request THEN no fsync runs and each file is written', () => {
    const d = scratch();
    writeFileSync(join(d, 'instance.lock'), String(process.ppid)); // a live process that is not this one owns the lock
    const before = calls();
    writeStatusFile(d, { alive: 'x' } as unknown as Status);
    const sent = requestNewNote(d);
    expect({ calls: calls() - before, sent, status: readFileSync(join(d, 'status.json'), 'utf8'), request: readdirSync(d).includes('new-note.request') }).toEqual({
      calls: 0,
      sent: 'sent',
      status: '{"alive":"x"}\n',
      request: true,
    });
  });

  it('3: WHEN snote saves the notes to state.json THEN exactly one fsync runs before the save returns', () => {
    const d = scratch();
    const state = { data: { notes: new Map() } } as unknown as Parameters<typeof saveState>[0];
    const before = calls();
    saveState(state, d);
    expect({ calls: calls() - before, saved: readdirSync(d).includes('state.json') }).toEqual({ calls: 1, saved: true });
  });

  it('4: WHEN src is scanned THEN the word durable, in any case, appears only in secure-fs.ts (3), direct-download.ts (1), new-request.ts (1), status-file.ts (1) and update-check.ts (2)', () => {
    const found: Record<string, number> = {};
    for (const f of walk('src')) {
      const n = (readFileSync(f, 'utf8').match(/durable/gi) ?? []).length;
      if (n > 0) found[f.replace(/\\/g, '/')] = n;
    }
    expect(found).toEqual(ALLOWED);
  });

  // test 4 reads text, so a shared constant or a computed key passes it; tests 5 and 6 run each writer and count.
  for (const [label, src, write] of DATA_WRITERS) {
    it(`5 (${label}): WHEN snote writes its ${label} file through ${src} THEN exactly one fsync runs for each file it writes`, async () => {
      const d = scratch();
      const before = calls();
      const files = await write(d);
      expect({ calls: calls() - before, written: files.length > 0 && files.every((f) => readdirSync(f.dir).includes(f.name)) }).toEqual({
        calls: files.length,
        written: true,
      });
    });
  }

  it('6: WHEN the update check writes its HEAD cache and its tag cache, and a direct install its release cache (#30 L5c), THEN no fsync runs and the three caches are written', async () => {
    const d = scratch();
    const cloneDir = join(d, 'clone');
    fs.mkdirSync(join(cloneDir, '.git'), { recursive: true });
    writeFileSync(join(cloneDir, '.git', 'config'), '[remote "origin"]\n\turl = https://example.invalid/snote.git\n');
    const state = join(d, 'state');
    const sha = 'b'.repeat(40);
    const run: GitRunner = async (args) => {
      if (args.includes('--tags')) return { code: 0, stdout: `${sha}\trefs/tags/v9.9.9\n` };
      if (args.includes('ls-remote')) return { code: 0, stdout: `${sha}\tHEAD\n` };
      if (args.includes('rev-parse')) return { code: 0, stdout: 'a'.repeat(40) + '\n' };
      return { code: 1, stdout: '' };
    };
    const before = calls();
    await checkRemoteUpdate({ cloneDir, stateDir: state, env: {}, now: 1_000_000, run });
    await checkRemoteVersion({ cloneDir, stateDir: state, env: {}, now: () => 1_000_000, run });
    await directNewest({ dataDir: state, build: { appDir: d, version: '0.2.11' }, now: () => 1_000_000, list: async () => ({ version: '0.2.12' }) });
    expect({ calls: calls() - before, caches: readdirSync(state).sort() }).toEqual({
      calls: 0,
      caches: ['direct-release-check.json', 'update-check.json', 'update-tag-check.json'],
    });
  });

  it('7: WHEN src is scanned THEN every secureWriteFileSync call site is one that tests 2, 3, 5 and 6 run, plus the crash bundle in main.tsx', () => {
    const found: Record<string, number> = {};
    for (const f of walk('src')) {
      const n = (readFileSync(f, 'utf8').match(/secureWriteFileSync\(/g) ?? []).length;
      if (n > 0) found[f.replace(/\\/g, '/')] = n;
    }
    expect(found).toEqual(CALL_SITES);
  });
});
