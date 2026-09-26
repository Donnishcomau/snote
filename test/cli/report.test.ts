/**
 * T233: `snote --report` — a bundle without needing a crash.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('T233 --report', () => {
  let stateDir: string;
  let dataDir: string;
  let logged: string[];
  let io: { log: (text: string) => void };
  const originalStateHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t233-state-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t233-data-'));
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
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const seedState = () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n1'),
      note: {
        content: 'Hello',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: Date.now(),
        creationDate: Date.now(),
      },
    });
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid('n2'),
      note: {
        content: 'Hi there',
        systemTags: [],
        tags: [],
        deleted: false,
        modificationDate: Date.now(),
        creationDate: Date.now(),
      },
    });
    store.dispatch({
      type: 'ADD_NOTE_TAG' as const,
      noteId: eid('n1'),
      tagName: 'work' as never,
    });
    saveState(store.getState(), dataDir);
  };

  const reportFiles = () => {
    const dir = path.join(stateDir, 'snote');
    return fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.includes('report-'))
      : [];
  };

  it("1: WHEN a store is seeded with notes Hello (5 chars) and Hi there (8 chars) and tag work, saveStated into dataDir, and stateDir is empty THEN it resolves 0, exactly 1 file matching report- exists in stateDir, and its parsed JSON has source live, session.noteCount 2, session.tagCount 1", async () => {
    seedState();

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const files = reportFiles();
    expect(files).toHaveLength(1);
    const json = JSON.parse(
      fs.readFileSync(path.join(stateDir, 'snote', files[0]), 'utf8'),
    );
    expect(json.source).toBe('live');
    expect(json.session.noteCount).toBe(2);
    expect(json.session.tagCount).toBe(1);
  });

  it("2: WHEN stateDir already holds crash-2020-01-01T00-00-00-000Z.json with content {\"error\":{\"message\":\"boom\"}} THEN the written report's source is crash and error.message is boom", async () => {
    const snoteDir = path.join(stateDir, 'snote');
    fs.mkdirSync(snoteDir, { recursive: true });
    fs.writeFileSync(
      path.join(snoteDir, 'crash-2020-01-01T00-00-00-000Z.json'),
      JSON.stringify({ error: { message: 'boom' } }),
    );

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const files = reportFiles();
    expect(files).toHaveLength(1);
    const json = JSON.parse(
      fs.readFileSync(path.join(snoteDir, files[0]), 'utf8'),
    );
    expect(json.source).toBe('crash');
    expect(json.error.message).toBe('boom');
  });

  it("3: WHEN stateDir holds both that file and a later crash-2021-01-01T00-00-00-000Z.json with content {\"error\":{\"message\":\"new\"}} THEN the written report's error.message is new", async () => {
    const snoteDir = path.join(stateDir, 'snote');
    fs.mkdirSync(snoteDir, { recursive: true });
    fs.writeFileSync(
      path.join(snoteDir, 'crash-2020-01-01T00-00-00-000Z.json'),
      JSON.stringify({ error: { message: 'boom' } }),
    );
    fs.writeFileSync(
      path.join(snoteDir, 'crash-2021-01-01T00-00-00-000Z.json'),
      JSON.stringify({ error: { message: 'new' } }),
    );

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const files = reportFiles();
    expect(files).toHaveLength(1);
    const json = JSON.parse(
      fs.readFileSync(path.join(snoteDir, files[0]), 'utf8'),
    );
    expect(json.error.message).toBe('new');
  });

  it("4: WHEN case 2 runs THEN logged.join('\\n') contains the report file's path and contains Hand this file to your coding agent", async () => {
    const snoteDir = path.join(stateDir, 'snote');
    fs.mkdirSync(snoteDir, { recursive: true });
    fs.writeFileSync(
      path.join(snoteDir, 'crash-2020-01-01T00-00-00-000Z.json'),
      JSON.stringify({ error: { message: 'boom' } }),
    );

    const code = await main(['--report', '--data-dir', dataDir], io);

    expect(code).toBe(0);
    const files = reportFiles();
    expect(files).toHaveLength(1);
    const out = logged.join('\n');
    expect(out).toContain(path.join(snoteDir, files[0]));
    expect(out).toContain('Hand this file to your coding agent');
  });

  it("5: WHEN stateDir's parent path is a FILE (so it cannot be created) THEN main still resolves 0 and logged.join('\\n') contains could not be saved", async () => {
    fs.rmSync(stateDir, { recursive: true, force: true });
    const parent = path.join(os.tmpdir(), 'snote-t233-blocked-' + process.pid);
    fs.rmSync(parent, { recursive: true, force: true });
    fs.writeFileSync(parent, 'not a directory');
    process.env.XDG_STATE_HOME = parent;

    const code = await main(['--report', '--data-dir', dataDir], io);

    fs.rmSync(parent, { force: true });

    expect(code).toBe(0);
    expect(logged.join('\n')).toContain('could not be saved');
  });
});
