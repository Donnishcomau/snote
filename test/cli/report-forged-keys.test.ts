/**
 * #8: `snote --report` must not trust a crash file's `keysMasked`
 * claim: raw key text is removed even when the file says its keys are
 * already masked; a normal masked file keeps producing the same report.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';

describe('#8 --report does not trust a forged keysMasked marker', () => {
  let stateDir: string;
  let dataDir: string;
  let logged: string[];
  const originalStateHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-8-state-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-8-data-'));
    process.env.XDG_STATE_HOME = stateDir;
    logged = [];
  });

  afterEach(() => {
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // Exactly the object ink's useInput hands to the app (use-input.js):
  // the 20 boolean flags, plus an optional `eventType`.
  const inkKey = (overrides: Record<string, unknown> = {}) => ({
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, home: false, end: false, return: false,
    escape: false, ctrl: false, shift: false, tab: false, backspace: false,
    delete: false, meta: false, super: false, hyper: false, capsLock: false,
    numLock: false, ...overrides,
  });

  const writeCrash = (session: Record<string, unknown>) => {
    const dir = path.join(stateDir, 'snote');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'crash-2026-01-01T00-00-00.000Z.json'),
      JSON.stringify({
        version: '0.0.1',
        when: '2026-01-01T00:00:00.000Z',
        terminal: '80x24',
        error: { name: 'TypeError', message: 'x', stack: [] },
        session: { version: '0.0.1', terminal: '80x24', noteCount: 1, noteLengths: [5], tagCount: 0, collectionType: 'all', ...session },
      }),
    );
    return dir;
  };
  const runReport = async (dir: string) => {
    const code = await main(['--report', '--data-dir', dataDir], { log: (t: string) => logged.push(t) });
    expect(code).toBe(0);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('report-'));
    expect(files.length).toBe(1);
    return fs.readFileSync(path.join(dir, files[0]), 'utf8');
  };

  it('1: WHEN the newest crash file claims `keysMasked: true` but its key entries smuggle raw text into the key object (`sequence` and `name` holding `hunter2`, `sequence` holding `PASTEDNOTE WORDS`) THEN the report bundle contains neither `hunter2` nor `PASTEDNOTE`', async () => {
    const dir = writeCrash({
      keysMasked: true,
      keys: [
        { input: '<text>', key: inkKey({ sequence: 'hunter2', name: 'hunter2' }) },
        { input: 'j', key: inkKey({ sequence: 'PASTEDNOTE WORDS' }) },
      ],
    });
    const text = await runReport(dir);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('PASTEDNOTE');
  });

  it('2: WHEN the newest crash file is a normal 0.2.4 file (`keysMasked`) with full ink key objects, command keys `j` and `q`, a `<text>` entry and one entry with `eventType: "press"` THEN the report keeps `session.keys` exactly as stored and has no `keysDropped`', async () => {
    const keys = [
      { input: 'j', key: inkKey() },
      { input: '<text>', key: inkKey({ eventType: 'press' }) },
      { input: 'q', key: inkKey() },
    ];
    const dir = writeCrash({ keysMasked: true, keys });
    const text = await runReport(dir);
    const session = JSON.parse(text).session;
    expect(session.keys).toEqual(keys);
    expect(session.keysDropped).toBeUndefined();
  });
});
