/**
 * a server-forced sign-out deletes only the credentials. Unsynced
 * changes, state and drafts stay byte for byte and sync once when the same
 * account signs in again; another account's files are never touched. Real
 * client wiring (accountStore) against the fake server.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { accountStore } from '../../src/cli/main';
import { saveToken, keptChangesNotice, accountDir } from '../../src/core/token';
import { resetProblemSignal } from '../../src/core/problem-signal';
import { Root } from '../../src/tui/Root';
import type { Auth } from '../../src/tui/Root';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

// 3 kept changes: note n1 (unsynced.json and sent-changes.json name it once), the tombstone `gone` and one draft.
const KEPT_TEXT = 'Signed out by the server. 3 unsynced changes are kept in test@example.com. Log in again to sync them, or log out to remove them.';
const EMAIL = 'test@example.com';
const OTHER = 'other@example.com';
const COLLIDE_A = "o'brien@example.com";
const COLLIDE_B = 'o_brien@example.com';

/** The frame with line wraps folded to single spaces. */
const flat = (f: string): string => f.replace(/\s+/g, ' ');

describe('a forced sign-out keeps unsynced changes', () => {
  let server: FakeSimperiumServer | null = null;
  let dir = '';
  let shown: ReturnType<typeof render> | null = null;
  let built: ReturnType<typeof accountStore> | null = null;

  afterEach(() => {
    shown?.unmount();
    shown = null;
    server?.stop();
    server = null;
    resetProblemSignal();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Every file under `root` (relative path -> bytes as hex), skipping the instance lock. */
  function snapshot(root: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name !== 'instance.lock') out[path.relative(root, p)] = fs.readFileSync(p).toString('hex');
      }
    };
    if (fs.existsSync(root)) walk(root);
    return out;
  }

  /** Root on a real account store. The server ignores the first login, so a note stays unsynced. */
  async function start(saved: boolean, ignore = 1000) {
    server = new FakeSimperiumServer();
    await server.start();
    server.ignoreInitConnections = ignore;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237-'));
    if (saved) await saveToken(dir, { email: EMAIL, token: 'test-token', server: server.url });
    return mount();
  }

  function mount() {
    const makeStoreFor = vi.fn((auth: Auth, onLogout: () => void) => {
      built = accountStore({ dataDir: dir, appId: 'test-app', server: server!.url, authWatchdogMs: 60000 }, auth, onLogout);
      return built.store as never;
    });
    shown = render(
      <Root
        dataDir={dir}
        server={server!.url}
        width={160}
        height={30}
        makeStoreFor={makeStoreFor}
        requestCode={vi.fn().mockResolvedValue(undefined)}
        completeLogin={vi.fn().mockResolvedValue('test-token')}
        passwordLogin={vi.fn().mockResolvedValue('test-token')}
      />,
    );
    return shown;
  }

  async function signIn(r: ReturnType<typeof render>, email: string) {
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, 'Email:');
    await new Promise((res) => setImmediate(res));
    r.stdin.write(email);
    await waitForFrame(r.lastFrame, `Email: ${email}`);
    r.stdin.write('\t');
    await waitForFrame(r.lastFrame, `Password login for ${email}`);
    r.stdin.write('hunter2secret');
    await waitForFrame(r.lastFrame, 'Password: *************');
    r.stdin.write('\r');
  }

  /** Wait for a connected client, add one unsynced note and the other files an account holds. */
  async function addWork(r: ReturnType<typeof render>, email: string, extras = true) {
    await vi.waitFor(() => {
      const c = (built?.store as unknown as { client?: { open?: boolean } } | undefined)?.client;
      if (!c?.open || server!.openSockets.size !== 1) throw new Error('no connected client yet');
    }, { timeout: 5000, interval: 10 });
    built!.store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: 'unsynced', systemTags: [], tags: [] } } as never);
    const acct = accountDir(dir, email);
    await vi.waitFor(() => {
      for (const f of ['unsynced.json', 'state.json']) if (!fs.existsSync(path.join(acct, f))) throw new Error(`${f} not written yet`);
    }, { timeout: 5000, interval: 10 });
    if (!extras) return acct;
    // Files the editor and the sync layer leave beside them (written after start-up, so no recovery rewrites them).
    const draft = path.join(acct, 'drafts', 'snote-Ab12Cd');
    fs.mkdirSync(draft, { recursive: true });
    fs.writeFileSync(path.join(draft, 'note.md'), 'draft text');
    fs.writeFileSync(path.join(draft, 'source.json'), '{"v":1,"id":"n1"}');
    fs.writeFileSync(path.join(acct, 'sent-changes.json'), '{"n1":["ccid-1"]}');
    fs.writeFileSync(path.join(acct, 'tombstones.json'), '["gone"]');
    fs.writeFileSync(path.join(acct, 'ghosts-note.json'), '{"n0":{"version":1}}');
    // Root files: the blog token (a credential) and the record of what was sent.
    fs.writeFileSync(path.join(dir, 'blog.json'), '{"origin":"https://blog.example","token":"dummy-bearer"}');
    fs.writeFileSync(path.join(dir, 'blog-sent.json'), '{"n1":{"sent":1}}');
    return acct;
  }

  /** The client's own `unauthorized` event: a server-forced sign-out. */
  async function forceSignOut(r: ReturnType<typeof render>) {
    (built!.store as unknown as { client: { emit: (e: string) => void } }).client.emit('unauthorized');
    await waitForFrame(r.lastFrame, (f) => f.includes('Email:') && flat(f).includes('Log in again to sync them, or log out to remove them.'));
    await vi.waitFor(() => {
      if (server!.openSockets.size !== 0) throw new Error('socket still open');
    }, { timeout: 5000, interval: 10 });
  }

  /** A forced sign-out with nothing kept: only the expired-session line, and today's full logout sweep leaves the data folder empty. */
  async function nothingKeptCase(saved: boolean, othersKept = false) {
    const r = await start(saved);
    if (!saved) await signIn(r, EMAIL);
    await vi.waitFor(() => {
      const c = (built?.store as unknown as { client?: { open?: boolean } } | undefined)?.client;
      if (!c?.open || server!.openSockets.size !== 1) throw new Error('no connected client yet');
    }, { timeout: 5000, interval: 10 });
    // A second account keeping a change: a sweep of every folder would delete it.
    const second = path.join(dir, OTHER);
    if (othersKept) {
      fs.mkdirSync(second);
      fs.writeFileSync(path.join(second, 'unsynced.json'), '{"x":1}');
    }
    const secondBefore = snapshot(second);
    // The cache of notes already synced (nothing unsynced): the sweep removes it.
    fs.writeFileSync(path.join(accountDir(dir, EMAIL), 'state.json'), '{}');
    (built!.store as unknown as { client: { emit: (e: string) => void } }).client.emit('unauthorized');
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes('Email:') && f.includes('Error: Your session has expired or was revoked. Log in again.'));
    await vi.waitFor(() => {
      if (server!.openSockets.size !== 0) throw new Error('socket still open');
    }, { timeout: 5000, interval: 10 });
    expect(frame).not.toContain('Signed out by the server');
    if (othersKept) {
      // Nothing kept here but kept in a second account: credentials go, the second account stays byte for byte.
      expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false);
      expect(Object.keys(secondBefore)).toEqual(['unsynced.json']);
      expect(snapshot(second)).toEqual(secondBefore);
    } else {
    await vi.waitFor(() => {
      if (fs.readdirSync(dir).length !== 0) throw new Error('data folder not swept yet: ' + JSON.stringify(fs.readdirSync(dir)) + JSON.stringify(fs.existsSync(path.join(dir, EMAIL)) ? fs.readdirSync(path.join(dir, EMAIL)) : []));
    }, { timeout: 5000, interval: 10 });
    expect(fs.readdirSync(dir)).toEqual([]);
    }
    shown?.unmount();
    shown = null;
    server?.stop();
    server = null;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  async function keptFilesCase(saved: boolean) {
    const r = await start(saved);
    if (!saved) {
      await signIn(r, EMAIL);
    }
    const acct = await addWork(r, EMAIL);
    const before = snapshot(acct);
    const sentBefore = fs.readFileSync(path.join(dir, 'blog-sent.json')).toString('hex');
    await forceSignOut(r);
    const sentAfter = fs.existsSync(path.join(dir, 'blog-sent.json')) ? fs.readFileSync(path.join(dir, 'blog-sent.json')).toString('hex') : null;
    return { before, after: snapshot(acct), root: fs.readdirSync(dir).sort(), frame: r.lastFrame() ?? '', sentBefore, sentAfter };
  }

  function expectKept(c: Awaited<ReturnType<typeof keptFilesCase>>) {
    for (const f of ['unsynced.json', 'state.json', 'sent-changes.json', 'tombstones.json', 'ghosts-note.json',
      'drafts/snote-Ab12Cd/note.md', 'drafts/snote-Ab12Cd/source.json']) {
      expect(Object.keys(c.before)).toContain(f);
    }
    expect(c.after).toEqual(c.before);
    expect(c.root).toEqual([path.basename(accountDir(dir, EMAIL)), 'blog-sent.json'].sort());
    expect(c.sentAfter).toBe(c.sentBefore);
    expect(fs.existsSync(path.join(dir, 'blog.json'))).toBe(false);
    expect(flat(c.frame)).toContain(KEPT_TEXT);
  }

  it('1: WHEN a saved-token session is signed out by the server with an unsynced note, a draft with `source.json`, `sent-changes.json`, tombstones and ghosts THEN `auth.json` is gone, every file in the account folder is byte-identical and the login screen shows `Signed out by the server. 3 unsynced changes are kept in test@example.com. Log in again to sync them, or log out to remove them.`, `blog.json` is gone, `blog-sent.json` is byte-identical and, with nothing kept, only the expired-session line and the data folder is `[]` and, with nothing kept here but a second account keeping a change, `auth.json` is gone and the second account files stay byte-identical', { timeout: 30000 }, async () => {
    await nothingKeptCase(true);
    await nothingKeptCase(true, true);
    const c = await keptFilesCase(true);
    expectKept(c);
    expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false);
  });

  it('2: WHEN a session started from the login screen is signed out by the server with the same files THEN `auth.json` is gone, every file in the account folder is byte-identical and the login screen shows `Signed out by the server. 3 unsynced changes are kept in test@example.com. Log in again to sync them, or log out to remove them.`, `blog.json` is gone, `blog-sent.json` is byte-identical and, with nothing kept, only the expired-session line and the data folder is `[]`', { timeout: 30000 }, async () => {
    await nothingKeptCase(false);
    const c = await keptFilesCase(false);
    expectKept(c);
    expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false);
  });

  it('3: WHEN an unsynced note survives a forced sign-out and the same account signs in again THEN the server receives that change `1` time and holds the note `unsynced` once, and the login screen after the sign-out shows `Signed out by the server. 1 unsynced change is kept in test@example.com. Log in again to sync them, or log out to remove them.`', { timeout: 20000 }, async () => {
    const r = await start(true);
    await addWork(r, EMAIL, false);
    await forceSignOut(r);
    expect(server!.received.filter((m) => m.includes('"id":"n1"')).length).toBe(0);
    expect(flat(r.lastFrame() ?? '')).toContain('Signed out by the server. 1 unsynced change is kept in test@example.com. Log in again to sync them, or log out to remove them.');
    server!.ignoreInitConnections = 0;
    await signIn(r, EMAIL);
    await vi.waitFor(() => {
      if (server!.getObject('test-app', 'note', 'n1')?.data.content !== 'unsynced') throw new Error('note not on the server yet');
    }, { timeout: 8000, interval: 20 });
    await waitForFrame(r.lastFrame, '1 note');
    const sent = server!.received.filter((m) => m.includes('"id":"n1"') && m.includes('"o":"M"'));
    expect(sent.length).toBe(1);
    expect(server!.getObject('test-app', 'note', 'n1')?.data.content).toBe('unsynced');
  });

  it('4: WHEN a different account signs in after a forced sign-out THEN the first account\'s files stay byte-identical, the server receives `0` changes for its note and the notice reads `Unsynced changes from the previous account are kept on disk: test@example.com`, and, with the colliding emails `o\'brien@example.com` and `o_brien@example.com`, the first account folder is named in the second account notice', { timeout: 20000 }, async () => {
    const r = await start(true);
    const acct = await addWork(r, EMAIL);
    await forceSignOut(r);
    const before = snapshot(acct);
    server!.ignoreInitConnections = 0;
    await signIn(r, OTHER);
    await waitForFrame(r.lastFrame, 'Unsynced changes from the previous account are kept on disk: test@example.com');
    await vi.waitFor(() => {
      if (server!.openSockets.size !== 1) throw new Error('no connection for the new account yet');
    }, { timeout: 5000, interval: 10 });
    expect(snapshot(acct)).toEqual(before);
    expect(server!.received.filter((m) => m.includes('"id":"n1"')).length).toBe(0);
    expect(server!.getObject('test-app', 'note', 'n1')).toBeUndefined();
    // #109: two emails that map to one folder name are two accounts: sign in as the second one and the first one's folder is named.
    shown?.unmount();
    shown = null;
    server?.stop();
    server = null;
    fs.rmSync(dir, { recursive: true, force: true });
    const r2 = await start(false);
    await signIn(r2, COLLIDE_A);
    await addWork(r2, COLLIDE_A, false);
    await forceSignOut(r2);
    server!.ignoreInitConnections = 0;
    await signIn(r2, COLLIDE_B);
    await waitForFrame(r2.lastFrame, (f) => flat(f).includes('Unsynced changes from the previous account are kept on disk: o_brien@example.com'));
    expect(fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).length).toBe(2);
  });

  it('5: WHEN another folder is named with an escape byte and a symlinked folder holds an `unsynced.json` THEN the notice shows `evilred@example.com` (the name without its escape sequence), no escape byte and not the symlinked folder', { timeout: 20000 }, async () => {
    const r = await start(true);
    await addWork(r, EMAIL);
    await forceSignOut(r);
    const hostile = 'evil\u001b[31mred@example.com';
    const shownName = 'evilred@example.com'; // the sanitiser drops the whole escape sequence
    fs.mkdirSync(path.join(dir, hostile));
    fs.writeFileSync(path.join(dir, hostile, 'unsynced.json'), '{"x":1}');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237-out-'));
    fs.writeFileSync(path.join(outside, 'unsynced.json'), '{"y":2}');
    fs.symlinkSync(outside, path.join(dir, 'linked@example.com'));
    expect(keptChangesNotice(dir, OTHER)).toBe(`Unsynced changes from the previous account are kept on disk: ${shownName}, test@example.com`);
    server!.ignoreInitConnections = 0;
    await signIn(r, OTHER);
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes('kept on disk: ') && f.includes(shownName) && f.includes('test@example.com'));
    fs.rmSync(outside, { recursive: true, force: true });
    expect(frame).toContain(`kept on disk: ${shownName}, test@example.com`);
    expect(frame).not.toContain('\u001b');
    expect(frame).not.toContain('linked@example.com');
  });

  it('6: WHEN the user logs out themselves (`L`, then `logout` and Enter) with the same files THEN the data folder is `[]` and the login screen shows no `Signed out by the server`', { timeout: 20000 }, async () => {
    const r = await start(true);
    await addWork(r, EMAIL);
    r.stdin.write('L');
    await waitForFrame(r.lastFrame, "type 'logout' to confirm");
    r.stdin.write('logout');
    await waitForFrame(r.lastFrame, 'to confirm: logout');
    r.stdin.write('\r');
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes('Email:'));
    await vi.waitFor(() => {
      if (fs.readdirSync(dir).length !== 0) throw new Error('data folder not empty yet');
    }, { timeout: 5000, interval: 10 });
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(frame).not.toContain('Signed out by the server');
  });

  it('7: WHEN two unsynced notes `n1` and `n2` survive a forced sign-out and the same account signs in again THEN the server receives each change `1` time and holds `unsynced` and `second` once each', { timeout: 20000 }, async () => {
    const r = await start(true);
    await addWork(r, EMAIL, false);
    built!.store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n2' as never, note: { content: 'second', systemTags: [], tags: [] } } as never);
    await vi.waitFor(() => {
      if (!fs.readFileSync(path.join(accountDir(dir, EMAIL), 'unsynced.json'), 'utf8').includes('n2')) throw new Error('n2 not kept yet');
    }, { timeout: 5000, interval: 10 });
    await forceSignOut(r);
    expect(flat(r.lastFrame() ?? '')).toContain('Signed out by the server. 2 unsynced changes are kept in test@example.com.');
    server!.ignoreInitConnections = 0;
    await signIn(r, EMAIL);
    const sent = (id: string): number => server!.received.filter((m) => m.includes(`"id":"${id}"`) && m.includes('"o":"M"')).length;
    await expect
      .poll(() => ({
        n1: server!.getObject('test-app', 'note', 'n1')?.data.content, n2: server!.getObject('test-app', 'note', 'n2')?.data.content,
        sent1: sent('n1'), sent2: sent('n2'),
      }), { timeout: 8000, interval: 20 })
      .toEqual({ n1: 'unsynced', n2: 'second', sent1: 1, sent2: 1 });
    await waitForFrame(r.lastFrame, '2 notes');
    expect({ sent1: sent('n1'), sent2: sent('n2') }).toEqual({ sent1: 1, sent2: 1 });
  });

  it('8: WHEN `n1` is unsynced and `n2` sits in `sent-changes.json` (sent, not acknowledged) and the account is forced out and signs in again THEN the server receives `n1` once and `n2` once (not twice, not zero) and the files of the account are byte-identical before sign-in', { timeout: 20000 }, async () => {
    const r = await start(true);
    const acct = await addWork(r, EMAIL, false);
    built!.store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n2' as never, note: { content: 'second', systemTags: [], tags: [] } } as never);
    await vi.waitFor(() => {
      if (!fs.readFileSync(path.join(acct, 'unsynced.json'), 'utf8').includes('n2')) throw new Error('n2 not kept yet');
      if (!fs.readFileSync(path.join(acct, 'state.json'), 'utf8').includes('second')) throw new Error('state.json not saved yet');
    }, { timeout: 5000, interval: 10 });
    fs.writeFileSync(path.join(acct, 'sent-changes.json'), '{"n2":["ccid-2"]}');
    const before = snapshot(acct);
    await forceSignOut(r);
    expect(Object.keys(before)).toContain('sent-changes.json');
    expect(snapshot(acct)).toEqual(before);
    server!.ignoreInitConnections = 0;
    await signIn(r, EMAIL);
    const sent = (id: string): number => server!.received.filter((m) => m.includes(`"id":"${id}"`) && m.includes('"o":"M"')).length;
    await expect
      .poll(() => ({
        n1: server!.getObject('test-app', 'note', 'n1')?.data.content, n2: server!.getObject('test-app', 'note', 'n2')?.data.content,
        sent1: sent('n1'), sent2: sent('n2'),
      }), { timeout: 8000, interval: 20 })
      .toEqual({ n1: 'unsynced', n2: 'second', sent1: 1, sent2: 1 });
    await waitForFrame(r.lastFrame, '2 notes');
    expect({ sent1: sent('n1'), sent2: sent('n2') }).toEqual({ sent1: 1, sent2: 1 });
  });

  it('9: WHEN account A is forced out with a kept note and account B signs in THEN the server of B receives `0` of A\'s changes', { timeout: 20000 }, async () => {
    const r = await start(true);
    await addWork(r, EMAIL, false);
    await forceSignOut(r);
    server!.ignoreInitConnections = 0;
    await signIn(r, OTHER);
    await vi.waitFor(() => {
      if (server!.openSockets.size !== 1) throw new Error('no connection for B yet');
    }, { timeout: 5000, interval: 10 });
    built!.store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'b1' as never, note: { content: 'from b', systemTags: [], tags: [] } } as never);
    await expect
      .poll(() => ({ b1: server!.getObject('test-app', 'note', 'b1')?.data.content, a: server!.received.filter((m) => m.includes('"id":"n1"')).length, n1: server!.getObject('test-app', 'note', 'n1') }), { timeout: 8000, interval: 20 })
      .toEqual({ b1: 'from b', a: 0, n1: undefined });
  });
});
