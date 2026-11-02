/**
 * #109: every account folder carries an account id (`account.json`, the pair
 * email + server), so two emails that normalise to one folder name, or one
 * email on two servers, never share a folder or read each other's files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { accountStore, buildStore } from '../../src/cli/main';
import { accountDir, logout, saveToken } from '../../src/core/token';
import { recordAccountId, recordSavedAccountId } from '../../src/core/account-id';

import type { EntityId } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

const appId = 'test-app';
const OFFLINE = 'ws://127.0.0.1:9';

const waitFor = async (cond: () => boolean, timeoutMs = 2500): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const createNote = (id: string, content: string): A.ActionType =>
  ({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: id as unknown as EntityId,
    note: { content, systemTags: [], tags: [] },
  }) as A.ActionType;

const folders = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

const idOf = (root: string, folder: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(root, folder, 'account.json'), 'utf8'));

describe('#109 the account id keeps colliding accounts apart', () => {
  let root: string;
  let server: FakeSimperiumServer;
  const stops: Array<() => void> = [];

  const signIn = (email: string, serverUrl: string, delay?: number) => {
    const built = accountStore(
      { dataDir: root, appId, server: serverUrl, noteEditDelayMs: delay ?? 10 },
      { email, token: 'test-token' },
      () => {}
    );
    stops.push(built.stopSaving);
    return built;
  };
  const signOutAll = (): void => {
    while (stops.length > 0) stops.pop()!();
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-acct-id-'));
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket(appId, 'note', [{ id: 'seed', data: { content: 'seed', creationDate: 1, modificationDate: 1, deleted: 0, systemTags: [], tags: [] }, version: 1 }]);
  });

  afterEach(async () => {
    signOutAll();
    await new Promise((r) => setTimeout(r, 50));
    server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("1: WHEN `o'brien@example.com` and `o_brien@example.com` sign in on one machine THEN there are exactly `2` account folders and each holds its own `account.json` email, and `recordAccountId` of `o_brien@example.com` on the first folder throws", () => {
    signIn("o'brien@example.com", OFFLINE);
    signOutAll();
    signIn('o_brien@example.com', OFFLINE);
    signOutAll();
    const names = folders(root);
    expect(names).toHaveLength(2);
    const emails = names.map((n) => (idOf(root, n) as { email: string }).email).sort();
    expect(emails).toEqual(["o'brien@example.com", 'o_brien@example.com']);
    expect(() => recordAccountId(accountDir(root, "o'brien@example.com"), 'o_brien@example.com', OFFLINE)).toThrow();
  });

  it("2: WHEN `o'brien@example.com` kept a change `secret a` and `o_brien@example.com` signs in THEN within 2.5 s the server has a change frame for `b1` and none for `a1`, and the second store holds `b1` but not `a1`", async () => {
    const first = signIn("o'brien@example.com", OFFLINE);
    first.store.dispatch(createNote('a1', 'secret a'));
    const firstFolder = accountDir(root, "o'brien@example.com");
    await waitFor(() => fs.existsSync(path.join(firstFolder, 'unsynced.json')));
    signOutAll();
    await new Promise((r) => setTimeout(r, 50));

    const second = signIn('o_brien@example.com', server.url);
    await waitFor(() => second.store.getState().data.notes.has('seed' as EntityId));
    second.store.dispatch(createNote('b1', 'mine b'));
    const frames = (id: string): string[] =>
      server.received.filter((m) => m.includes(':c:') && m.includes(`"id":"${id}"`));
    await waitFor(
      () =>
        frames('b1').length >= 1 &&
        second.store.getState().data.notes.has('b1' as EntityId),
    );
    expect(frames('b1').length).toBeGreaterThanOrEqual(1);
    expect(frames('a1')).toHaveLength(0);
    expect([...second.store.getState().data.notes.keys()]).not.toContain('a1');
  });

  it('3: WHEN a 0.2.8 folder (no `account.json`) holds 1 kept change `n1` and its owner signs in THEN within 2.5 s `account.json` names the email and the server holds `n1` with exactly `1` change frame', async () => {
    const dir = accountDir(root, 'a@b.co');
    fs.mkdirSync(dir, { recursive: true });
    const old = buildStore(
      { dataDir: dir, appId, server: OFFLINE, noteEditDelayMs: 10 },
      { email: 'a@b.co', token: 'test-token' },
      () => {}
    );
    stops.push(old.stopSaving);
    old.store.dispatch(createNote('n1', 'kept change'));
    await waitFor(() => fs.existsSync(path.join(dir, 'unsynced.json')));
    signOutAll();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(path.join(dir, 'instance.lock'), { force: true });
    expect(fs.existsSync(path.join(dir, 'account.json'))).toBe(false);

    signIn('a@b.co', server.url);
    const frames = (): string[] =>
      server.received.filter((m) => m.includes(':c:') && m.includes('"id":"n1"'));
    await waitFor(
      () =>
        fs.existsSync(path.join(dir, 'account.json')) &&
        server.getObject(appId, 'note', 'n1')?.data.content === 'kept change' &&
        frames().length === 1,
    );
    expect(idOf(root, 'a@b.co')).toEqual({ v: 1, email: 'a@b.co', server: server.url });
    expect(server.getObject(appId, 'note', 'n1')!.data.content).toBe('kept change');
    expect(frames()).toHaveLength(1);
  });

  const hostile: Array<[string, (file: string, outside: string) => void]> = [
    ['symlink', (file, outside) => {
      fs.writeFileSync(outside, JSON.stringify({ v: 1, email: 'victim@example.com', server: OFFLINE }));
      fs.symlinkSync(outside, file);
    }],
    ['non-json', (file) => fs.writeFileSync(file, 'not json at all')],
    ['v2', (file) => fs.writeFileSync(file, JSON.stringify({ v: 2, email: 'victim@example.com', server: OFFLINE }))],
    ['escape byte', (file) =>
      fs.writeFileSync(file, JSON.stringify({ v: 1, email: 'a@b.co' + String.fromCharCode(27) + '[31m', server: OFFLINE }))],
  ];

  it('4: WHEN `account.json` is a symlink, non-JSON, `v` 2 or has an escape byte in the email THEN it counts as no id: a@b.co keeps its own folder, `account.json` becomes a regular file naming `a@b.co`, and the symlink target is unchanged', () => {
    for (const [label, plant] of hostile) {
      const r = fs.mkdtempSync(path.join(root, 'case-'));
      const dir = accountDir(r, 'a@b.co');
      fs.mkdirSync(dir, { recursive: true });
      const outside = path.join(r, 'outside.json');
      plant(path.join(dir, 'account.json'), outside);
      const before = fs.existsSync(outside) ? fs.readFileSync(outside, 'utf8') : '';
      const built = accountStore({ dataDir: r, appId, server: OFFLINE }, { email: 'a@b.co', token: 'test-token' }, () => {});
      built.stopSaving();
      const names = folders(r);
      expect(`${label}: ${names.join(',')}`).toBe(`${label}: a@b.co`);
      const st = fs.lstatSync(path.join(dir, 'account.json'));
      expect(`${label}: ${st.isFile()}`).toBe(`${label}: true`);
      expect((idOf(r, 'a@b.co') as { email: string }).email).toBe('a@b.co');
      const after = fs.existsSync(outside) ? fs.readFileSync(outside, 'utf8') : '';
      expect(after).toBe(before);
    }
  });

  it('5: WHEN a@b.co signed in and then logout runs on the data folder THEN `account.json` is gone', async () => {
    signIn('a@b.co', OFFLINE);
    signOutAll();
    const file = path.join(root, 'a@b.co', 'account.json');
    expect(fs.existsSync(file)).toBe(true);
    fs.writeFileSync(path.join(root, 'a@b.co', 'mine.txt'), 'x');
    await logout(root);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.join(root, 'a@b.co', 'mine.txt'))).toBe(true);
  });

  it('6: WHEN a@b.co signs in to server `ws://127.0.0.1:9` and then to `ws://127.0.0.1:8` THEN there are exactly `2` account folders and each `account.json` names its own server', () => {
    signIn('a@b.co', OFFLINE);
    signOutAll();
    signIn('a@b.co', 'ws://127.0.0.1:8');
    signOutAll();
    const names = folders(root);
    expect(names).toHaveLength(2);
    const servers = names.map((n) => (idOf(root, n) as { server: string }).server).sort();
    expect(servers).toEqual(['ws://127.0.0.1:8', 'ws://127.0.0.1:9']);
  });

  it("7: WHEN a 0.2.8 folder holds kept change `a1`, the root auth.json names `o'brien@example.com`, the startup step runs, and `o_brien@example.com` then signs in THEN there are `2` folders and no change frame for `a1` reaches the server", async () => {
    const dir = accountDir(root, "o'brien@example.com");
    fs.mkdirSync(dir, { recursive: true });
    const old = buildStore(
      { dataDir: dir, appId, server: OFFLINE, noteEditDelayMs: 10 },
      { email: "o'brien@example.com", token: 'test-token' },
      () => {}
    );
    stops.push(old.stopSaving);
    old.store.dispatch(createNote('a1', 'kept a'));
    await waitFor(() => fs.existsSync(path.join(dir, 'unsynced.json')));
    signOutAll();
    fs.rmSync(path.join(dir, 'instance.lock'), { force: true });
    await saveToken(root, { email: "o'brien@example.com", token: 'test-token', server: server.url });
    await recordSavedAccountId(root);
    expect(fs.existsSync(path.join(root, 'o_brien@example.com', 'account.json'))).toBe(true);
    expect(idOf(root, "o_brien@example.com")).toEqual({ v: 1, email: "o'brien@example.com", server: server.url });

    const second = signIn('o_brien@example.com', server.url);
    await waitFor(() => second.store.getState().data.notes.has('seed' as EntityId));
    second.store.dispatch(createNote('b1', 'mine b'));
    const frames = (id: string): string[] =>
      server.received.filter((m) => m.includes(':c:') && m.includes(`"id":"${id}"`));
    await waitFor(() => frames('b1').length >= 1);
    expect(folders(root)).toHaveLength(2);
    expect(frames('a1')).toHaveLength(0);
    const main = fs.readFileSync(path.join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    expect(main).toContain('await prepareDataDir(dataDir);\n  await recordSavedAccountId(dataDir);');
  });
});
