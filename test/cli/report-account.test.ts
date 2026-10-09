/**
 * T508: `snote --report` reads state.json from the account folder the
 * app actually uses (`<data dir>/<email>/`, since T156), not the data
 * dir root, whenever `auth.json` names a saved account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import { saveToken, accountDir } from '../../src/core/token';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const EMAIL = 'alex.report@example.com';
const TOKEN = 'TOKEN-SECRET-508';

describe('T508 --report reads the account folder', () => {
  let tmpRoot: string;
  let stateDir: string;
  let dataDir: string;
  let logged: string[];
  let io: { log: (text: string) => void };
  const originalStateHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t508-root-'));
    stateDir = path.join(tmpRoot, 'state');
    dataDir = path.join(tmpRoot, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.XDG_STATE_HOME = stateDir;
    logged = [];
    io = { log: (text) => logged.push(text) };
  });

  afterEach(() => {
    if (originalStateHome === undefined) {
      delete process.env.XDG_STATE_HOME;
    } else {
      process.env.XDG_STATE_HOME = originalStateHome;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Seed `count` notes into `<dir>/state.json` through the same store +
  // saveState path the app uses. Note i holds SECRET-NOTE-i; note 1
  // carries the tag SECRET-TAG.
  const seedNotes = (dir: string, count: number) => {
    const store = makeStore({ stubClient: {} });
    for (let i = 1; i <= count; i++) {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: eid('n' + i),
        note: {
          content: `SECRET-NOTE-${i}`,
          systemTags: [],
          tags: [],
          deleted: false,
          modificationDate: Date.now(),
          creationDate: Date.now(),
        },
      });
    }
    store.dispatch({
      type: 'ADD_NOTE_TAG' as never,
      noteId: eid('n1'),
      tagName: 'SECRET-TAG' as never,
    });
    fs.mkdirSync(dir, { recursive: true });
    saveState(store.getState(), dir);
  };

  const reportFiles = () => {
    const dir = path.join(stateDir, 'snote');
    return fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.includes('report-'))
      : [];
  };

  const readBundle = (): Record<string, unknown> => {
    const files = reportFiles();
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(
      path.join(stateDir, 'snote', files[0]),
      'utf8',
    );
    return JSON.parse(text) as Record<string, unknown>;
  };

  it("1: WHEN auth.json names alex.report@example.com, its account folder holds a state.json with 5 notes (one tagged SECRET-TAG) and the data dir root holds no state.json THEN --report resolves 0 and the bundle has source live and session.noteCount 5 and session.tagCount 1", async () => {
    seedNotes(accountDir(dataDir, EMAIL), 5);
    await saveToken(dataDir, { email: EMAIL, token: TOKEN });
    expect(fs.existsSync(path.join(dataDir, 'state.json'))).toBe(false);

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const bundle = readBundle();
    expect(bundle.source).toBe('live');
    const session = bundle.session as Record<string, unknown>;
    expect(session.noteCount).toBe(5);
    expect(session.tagCount).toBe(1);
  });

  it("2: WHEN the same 5-note account (notes SECRET-NOTE-1 to SECRET-NOTE-5, token TOKEN-SECRET-508) is reported THEN session.noteCount is 5 and the bundle text contains none of SECRET-NOTE-1, SECRET-TAG, alex.report@example.com and TOKEN-SECRET-508", async () => {
    seedNotes(accountDir(dataDir, EMAIL), 5);
    await saveToken(dataDir, { email: EMAIL, token: TOKEN });

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const files = reportFiles();
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(
      path.join(stateDir, 'snote', files[0]),
      'utf8',
    );
    const bundle = JSON.parse(text) as Record<string, unknown>;
    const session = bundle.session as Record<string, unknown>;
    expect(session.noteCount).toBe(5);
    expect(text).not.toContain('SECRET-NOTE-1');
    expect(text).not.toContain('SECRET-TAG');
    expect(text).not.toContain('alex.report@example.com');
    expect(text).not.toContain('TOKEN-SECRET-508');
  });

  it("3: WHEN the data dir has no auth.json and its root holds a state.json with 2 notes THEN session.noteCount is 2", async () => {
    seedNotes(dataDir, 2);

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const bundle = readBundle();
    const session = bundle.session as Record<string, unknown>;
    expect(session.noteCount).toBe(2);
  });

  it("4: WHEN auth.json names the account but its folder does not exist THEN --report resolves 0 with session.noteCount 0 and the data dir entries are still ['auth.json']", async () => {
    await saveToken(dataDir, { email: EMAIL, token: TOKEN });

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const bundle = readBundle();
    const session = bundle.session as Record<string, unknown>;
    expect(session.noteCount).toBe(0);
    expect(fs.readdirSync(dataDir)).toEqual(['auth.json']);
  });

  it("5: WHEN auth.json holds the email ../outside and a sibling folder of the data dir (<tmp>/outside) holds a state.json with 3 notes THEN session.noteCount is 0", async () => {
    await saveToken(dataDir, { email: '../outside', token: TOKEN });
    // The sibling of the data dir, at the root of the temp tree.
    seedNotes(path.join(tmpRoot, 'outside'), 3);

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const bundle = readBundle();
    const session = bundle.session as Record<string, unknown>;
    expect(session.noteCount).toBe(0);
  });
});
