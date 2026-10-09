/**
 * T457 — logout removes only the files and account folders snote made;
 * every other file in the data dir stays (F102).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { logout, saveToken, loadToken } from '../../src/core/token';
import { main } from '../../src/cli/main';
import { Root, type Auth } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';

describe('T457 logout scope', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t457-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN dir holds USER, auth.json, blog.json and a@b.co/ with state.json, ghosts-note.json, tombstones.json, instance.lock THEN after logout(dir) its entries are ['keep.txt', 'photos'], contents kept", async () => {
    const dir = path.join(tmpDir, 'data');
    fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep');
    fs.writeFileSync(path.join(dir, 'photos', 'a.jpg'), 'jpg');
    fs.writeFileSync(
      path.join(dir, 'auth.json'),
      JSON.stringify({ email: 'a@b.co', token: 'tok' }),
    );
    fs.writeFileSync(path.join(dir, 'blog.json'), '{}');
    const acct = path.join(dir, 'a@b.co');
    fs.mkdirSync(acct, { recursive: true });
    fs.writeFileSync(path.join(acct, 'state.json'), '{}');
    fs.writeFileSync(path.join(acct, 'ghosts-note.json'), '{}');
    fs.writeFileSync(path.join(acct, 'tombstones.json'), '[]');
    fs.writeFileSync(path.join(acct, 'instance.lock'), '1');

    await logout(dir);

    expect(fs.readdirSync(dir).sort()).toEqual(['keep.txt', 'photos']);
    expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('keep');
    expect(fs.readFileSync(path.join(dir, 'photos', 'a.jpg'), 'utf8')).toBe('jpg');
  });

  it("2: WHEN sub-folder mixed/ holds state.json, state.json.tmp and mine.txt, and an empty empty/ exists THEN after logout(dir) mixed/ holds exactly ['mine.txt'] and empty/ still exists", async () => {
    const dir = path.join(tmpDir, 'data');
    const mixed = path.join(dir, 'mixed');
    fs.mkdirSync(mixed, { recursive: true });
    fs.writeFileSync(path.join(mixed, 'state.json'), '{}');
    fs.writeFileSync(path.join(mixed, 'state.json.tmp'), 'tmp');
    fs.writeFileSync(path.join(mixed, 'mine.txt'), 'mine');
    const empty = path.join(dir, 'empty');
    fs.mkdirSync(empty, { recursive: true });

    await logout(dir);

    expect(fs.readdirSync(mixed)).toEqual(['mine.txt']);
    expect(fs.existsSync(empty)).toBe(true);
  });

  it('3: WHEN symlink link points outside dir to a folder holding state.json, and dir (mode 0755) holds state.json, notes.md THEN after logout that state.json exists, dir is [link, notes.md], mode 0o700', async () => {
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    const outsideState = path.join(outside, 'state.json');
    fs.writeFileSync(outsideState, 'outside');

    const dir = path.join(tmpDir, 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(dir, 0o755);
    fs.writeFileSync(path.join(dir, 'state.json'), '{}');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'notes');
    fs.symlinkSync(outside, path.join(dir, 'link'), 'dir');

    await logout(dir);

    expect(fs.existsSync(outsideState)).toBe(true);
    expect(fs.readdirSync(dir).sort()).toEqual(['link', 'notes.md']);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("4: WHEN dir holds a saved token and USER and main(['--logout', '--data-dir', dir], io) runs THEN it resolves 0, logged has logged out, loadToken(dir) is null, entries are ['keep.txt', 'photos']", async () => {
    const dir = path.join(tmpDir, 'data');
    fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep');
    fs.writeFileSync(path.join(dir, 'photos', 'a.jpg'), 'jpg');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };

    const code = await main(['--logout', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(logged).toContain('logged out');
    expect(await loadToken(dir)).toBeNull();
    expect(fs.readdirSync(dir).sort()).toEqual(['keep.txt', 'photos']);
  });

  it("5: WHEN Root shows the app for a saved token in a dir with USER and L then y are written THEN, waited with waitForFrame (test/helpers/ink-waits.ts), the frame contains Email:, loadToken(dir) is null, and both USER files exist", async () => {
    const dir = path.join(tmpDir, 'data');
    fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep');
    fs.writeFileSync(path.join(dir, 'photos', 'a.jpg'), 'jpg');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });

    const seedStore = makeStore({ stubClient: {} });
    seedStore.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n1' as never,
      note: { content: 'Root note', systemTags: [], tags: [] },
    });
    const makeStoreFor: Mock = vi.fn(
      () => seedStore as Store<State>,
    );
    const requestCode: Mock = vi.fn().mockResolvedValue(undefined);
    const completeLogin: Mock = vi.fn().mockResolvedValue('tok2');

    const { stdin, lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Root note');

    stdin.write('L');
    await waitForFrame(lastFrame, 'log out and delete local data?');
    stdin.write('y');
    const frame = await waitForFrame(lastFrame, 'Email:');

    expect(frame).toContain('Email:');
    expect(await loadToken(dir)).toBeNull();
    expect(fs.existsSync(path.join(dir, 'keep.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'photos', 'a.jpg'))).toBe(true);

    unmount();
  });

  it("6: WHEN dir holds auth.json, ghosts-evil.json (g) and a file named with '\\x1b]52;c;QQ==\\x07' (h) THEN after logout(dir) auth.json is gone and the other two still hold g and h", async () => {
    const dir = path.join(tmpDir, 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'auth.json'),
      JSON.stringify({ email: 'a@b.co', token: 'tok' }),
    );
    const evil = path.join(dir, 'ghosts-evil.json');
    fs.writeFileSync(evil, 'g');
    const osc = path.join(dir, '\x1b]52;c;QQ==\x07');
    fs.writeFileSync(osc, 'h');

    await logout(dir);

    expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false);
    expect(fs.readFileSync(evil, 'utf8')).toBe('g');
    expect(fs.readFileSync(osc, 'utf8')).toBe('h');
  });
});
