/**
 * F163: `snote --report` re-bundles the newest crash file; one written
 * before redaction existed must be redacted again.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';

describe('F163 --report re-redacts an old crash file', () => {
  let stateDir: string;
  let dataDir: string;
  let logged: string[];
  const originalStateHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f163-state-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f163-data-'));
    process.env.XDG_STATE_HOME = stateDir;
    logged = [];
  });

  afterEach(() => {
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('1: WHEN the newest crash file is in the old format with a message holding `CONTENTMARK` and a stack line with the path `/x/me@example.com/n.js` THEN the report bundle contains neither `CONTENTMARK` nor `me@example.com`, and keeps `error.name`', async () => {
    const dir = path.join(stateDir, 'snote');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'crash-2026-01-01T00-00-00.000Z.json'),
      JSON.stringify({
        version: '0.0.1',
        when: '2026-01-01T00:00:00.000Z',
        terminal: '80x24',
        error: {
          name: 'TypeError',
          message: "ENOENT: open '/x/me@example.com/n.json' CONTENTMARK",
          stack: [
            '    at NOTE CONTENTMARK (/x/me@example.com/n.js:1:1)',
            '    at CONTENTMARK text',
            '    at g (/x/snote-main.js:3:4)',
          ],
        },
      }),
    );
    const code = await main(['--report', '--data-dir', dataDir], { log: (t: string) => logged.push(t) });
    expect(code).toBe(0);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('report-'));
    expect(files.length).toBe(1);
    const text = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    expect(text).not.toContain('CONTENTMARK');
    expect(text).not.toContain('me@example.com');
    expect(JSON.parse(text).error.name).toBe('TypeError');
  });

  it('2: WHEN the newest crash file is in the 0.2.4 format (`keysMasked`) with `session.keys` holding `hunter2`, a multi-char paste `PASTEDNOTE words` and editor typing `SECRETTYPED`, plus command keys `j`, `/` and `q` THEN the report bundle contains none of that text and keeps `j`, `/` and `q` as inputs', async () => {
    const dir = path.join(stateDir, 'snote');
    fs.mkdirSync(dir, { recursive: true });
    const k = (input: string) => ({ input, key: {} });
    fs.writeFileSync(
      path.join(dir, 'crash-2026-01-01T00-00-00.000Z.json'),
      JSON.stringify({
        version: '0.0.1',
        when: '2026-01-01T00:00:00.000Z',
        terminal: '80x24',
        error: { name: 'TypeError', message: 'x', stack: [] },
        session: {
          version: '0.0.1',
          keysMasked: true,
          terminal: '80x24',
          noteCount: 1,
          noteLengths: [5],
          tagCount: 0,
          collectionType: 'all',
          keys: [k('j'), k('/'), k('hunter2'), k('PASTEDNOTE words'), k('S'), k('2'), k('SECRETTYPED'), k('q')],
        },
      }),
    );
    const code = await main(['--report', '--data-dir', dataDir], { log: (t: string) => logged.push(t) });
    expect(code).toBe(0);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('report-'));
    expect(files.length).toBe(1);
    const text = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('PASTEDNOTE');
    expect(text).not.toContain('SECRETTYPED');
    const inputs = (JSON.parse(text).session.keys as { input: string }[]).map((e) => e.input);
    expect(inputs).toEqual(['j', '/', '<text>', '<text>', '<text>', '<text>', '<text>', 'q']);
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

  it('3: WHEN the newest crash file is a 0.2.3 file whose `session.keys` spell `the secret is hunter2` one character per entry THEN the report bundle contains none of `hunter2`, `secret` or a run of those letters, and `session.keys` is empty', async () => {
    const keys = [...'the secret is hunter2'].map((c) => ({ input: c, key: {} }));
    const dir = writeCrash({ keys });
    const text = await runReport(dir);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('secret');
    expect(text).not.toMatch(/h.?u.?n.?t/);
    expect(text).not.toMatch(/s.?e.?c.?r/);
    const session = JSON.parse(text).session;
    expect(session.keys).toEqual([]);
    expect(session.keysDropped).toBe('older version');
  });

  it('4: WHEN the newest crash file is a 0.2.4 file (`keysMasked`) with command keys `j`, `k` and `q` and `<text>` THEN the report keeps those command keys and `<text>` and has no `keysDropped`', async () => {
    const keys = ['j', 'k', '<text>', 'q'].map((c) => ({ input: c, key: {} }));
    const dir = writeCrash({ keys, keysMasked: true });
    const text = await runReport(dir);
    const session = JSON.parse(text).session;
    expect((session.keys as { input: string }[]).map((e) => e.input)).toEqual(['j', 'k', '<text>', 'q']);
    expect(session.keysDropped).toBeUndefined();
  });
});
