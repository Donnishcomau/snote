/**
 * T291: local data files private, and bug reports free of typed content.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Key } from 'ink';

import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import { secureMkdir } from '../../src/core/secure-fs';
import { recordKeyEvent, getKeyLog, resetKeyLog } from '../../src/tui/app-keys';
import { sessionSnapshot } from '../../src/core/crash-ring';
import { main } from '../../src/cli/main';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const emptyNote = {
  systemTags: [],
  tags: [],
  deleted: false,
  modificationDate: 1_700_000_000_000,
  creationDate: 1_700_000_000_000,
};

const seedTwoNotes = () => {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n1'),
    note: { ...emptyNote, content: 'First note' },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n2'),
    note: { ...emptyNote, content: 'Second note' },
  });
  return store;
};

describe('T291 private files', () => {
  let tmpDir: string;
  const originalStateHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t291-'));
  });

  afterEach(() => {
    if (originalStateHome === undefined) {
      delete process.env.XDG_STATE_HOME;
    } else {
      process.env.XDG_STATE_HOME = originalStateHome;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetKeyLog();
  });

  it("1: WHEN a store with two notes is persisted via saveState into a fresh temp dir THEN fs.statSync(dir).mode & 0o777 is 0o700 and fs.statSync(path.join(dir, 'state.json')).mode & 0o777 is 0o600", () => {
    const store = seedTwoNotes();
    const dir = path.join(tmpDir, 'data');

    saveState(store.getState(), dir);

    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, 'state.json')).mode & 0o777).toBe(0o600);
  });

  it("2: WHEN a temp dir already exists with mode 0o755 and saveState runs into it THEN afterwards fs.statSync(dir).mode & 0o777 is 0o700", () => {
    const store = seedTwoNotes();
    const dir = path.join(tmpDir, 'loose');
    fs.mkdirSync(dir);
    fs.chmodSync(dir, 0o755);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o755);

    saveState(store.getState(), dir);

    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("3: WHEN secureMkdir is called on a fresh nested path a/b/c THEN fs.statSync('a/b/c').mode & 0o777 is 0o700", () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c');

    secureMkdir(nested);

    expect(fs.statSync(nested).mode & 0o777).toBe(0o700);
  });

  it("4: WHEN main(['--report', '--data-dir', dataDir], io) runs with XDG_STATE_HOME pointed at a fresh temp dir THEN the written report-*.json file has fs.statSync(file).mode & 0o777 equal to 0o600", async () => {
    const dataDir = path.join(tmpDir, 'data');
    const stateHome = path.join(tmpDir, 'state');
    const store = seedTwoNotes();
    saveState(store.getState(), dataDir);
    process.env.XDG_STATE_HOME = stateHome;
    const logged: string[] = [];

    const code = await main(['--report', '--data-dir', dataDir], {
      log: (text) => logged.push(text),
    });

    expect(code).toBe(0);
    const snoteDir = path.join(stateHome, 'snote');
    const files = fs.readdirSync(snoteDir).filter((f) => f.startsWith('report-'));
    expect(files).toHaveLength(1);
    const file = path.join(snoteDir, files[0]);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(logged.join('\n')).toContain(file);
  });

  it("5: WHEN recordKeyEvent('s', key, true) then recordKeyEvent('e', key, true) run (simulating typed `s`,`e` with a text prompt open) and getKeyLog() is read THEN both entries have input `<text>`, and recordKeyEvent('j', key, false) THEN that entry's input is j", () => {
    const key = {} as Key;

    recordKeyEvent('s', key, true);
    recordKeyEvent('e', key, true);

    const log = getKeyLog();
    expect(log).toHaveLength(2);
    expect(log[0].input).toBe('<text>');
    expect(log[1].input).toBe('<text>');

    recordKeyEvent('j', key, false);

    expect(getKeyLog()[2].input).toBe('j');
  });

  it("6: WHEN a session that typed `secret words` while searchOpen was true is captured via sessionSnapshot and written by writeReport's bundle path THEN the resulting JSON file's contents do not contain the substring secret words", async () => {
    const dataDir = path.join(tmpDir, 'data');
    const stateHome = path.join(tmpDir, 'state');
    process.env.XDG_STATE_HOME = stateHome;
    resetKeyLog();

    // Simulated session: searchOpen was true, so App passes
    // textPromptOpen=true for every typed character.
    const searchKey = {
      search: true,
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    } as unknown as Key;
    for (const ch of 'secret words') {
      recordKeyEvent(ch, searchKey, true);
    }

    const store = seedTwoNotes();
    const session = sessionSnapshot(store.getState(), getKeyLog(), {
      columns: 80,
      rows: 24,
      version: '0.0.1',
    });
    expect(JSON.stringify(session.keys)).toContain('<text>');

    // writeReport's bundle path: a crash bundle is re-used verbatim if one
    // exists, so persist this session the way the crash handler would and
    // let main(['--report']) write the final file from it.
    const snoteDir = path.join(stateHome, 'snote');
    secureMkdir(snoteDir);
    fs.writeFileSync(
      path.join(snoteDir, 'crash-2021-01-01T00-00-00-000Z.json'),
      JSON.stringify({ error: { message: 'boom' }, session }),
    );
    saveState(store.getState(), dataDir);

    const logged: string[] = [];
    const code = await main(['--report', '--data-dir', dataDir], {
      log: (text) => logged.push(text),
    });
    expect(code).toBe(0);

    const files = fs.readdirSync(snoteDir).filter((f) => f.startsWith('report-'));
    expect(files).toHaveLength(1);
    const contents = fs.readFileSync(path.join(snoteDir, files[0]), 'utf8');
    expect(contents).not.toContain('secret words');
  });
});
