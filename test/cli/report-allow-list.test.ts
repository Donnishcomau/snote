/**
 * F230: `snote --report` builds its bundle from an allow-list of the
 * fields the crash writer produces; whatever else a crash file holds
 * does not reach the report.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { main } from '../../src/cli/main';
import { HOSTILE } from '../fixtures/hostile';

describe('F230 --report keeps only the known crash-file fields', () => {
  let stateDir: string;
  let dataDir: string;
  const originalStateHome = process.env.XDG_STATE_HOME;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f230-state-'));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f230-data-'));
    process.env.XDG_STATE_HOME = stateDir;
  });

  afterEach(() => {
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const baseSession = {
    version: '0.0.1', terminal: '80x24', noteCount: 3, noteLengths: [5, 6, 7],
    tagCount: 2, collectionType: 'all', keysMasked: true, keys: [{ input: 'j', key: {} }],
  };
  const baseTop = {
    version: '0.0.1', when: '2026-01-01T00:00:00.000Z', terminal: '80x24',
    error: { name: 'TypeError', message: 'permission denied', stack: [] as string[] },
  };

  const runReport = async (crash: Record<string, unknown>) => {
    const dir = path.join(stateDir, 'snote');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'crash-2026-01-01T00-00-00.000Z.json'), JSON.stringify(crash));
    const code = await main(['--report', '--data-dir', dataDir], { log: () => {} });
    expect(code).toBe(0);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('report-'));
    expect(files.length).toBe(1);
    return fs.readFileSync(path.join(dir, files[0]), 'utf8');
  };

  it('1: WHEN a crash file holds an extra top-level field `forged` with the value `FORGED-TOP-7731` THEN the report contains neither the value nor the field `forged`', async () => {
    const text = await runReport({ ...baseTop, session: baseSession, forged: 'FORGED-TOP-7731' });
    expect(text).not.toContain('FORGED-TOP-7731');
    expect(Object.keys(JSON.parse(text))).not.toContain('forged');
  });

  it('2: WHEN a crash file holds an extra `session` field `forged` with the value `FORGED-SESSION-4410` THEN the report contains neither the value nor the field `session.forged`', async () => {
    const text = await runReport({ ...baseTop, session: { ...baseSession, forged: 'FORGED-SESSION-4410' } });
    expect(text).not.toContain('FORGED-SESSION-4410');
    expect(Object.keys(JSON.parse(text).session)).not.toContain('forged');
  });

  it('3: WHEN a crash file holds the known fields and one unknown field THEN the report has the same values for the known ones, `source` is `crash` and the top-level fields are exactly `version`, `when`, `terminal`, `error`, `session`, `source`', async () => {
    const text = await runReport({ ...baseTop, session: baseSession, extra: 'FORGED-KEEP-3306' });
    const report = JSON.parse(text);
    expect(Object.keys(report).sort()).toEqual(['error', 'session', 'source', 'terminal', 'version', 'when']);
    expect(report.source).toBe('crash');
    expect(report.when).toBe('2026-01-01T00:00:00.000Z');
    expect(report.error).toEqual({ name: 'TypeError', message: 'permission denied', stack: [] });
    expect(report.session).toEqual(baseSession);
  });

  it('4: WHEN a known text field holds an object or an array (`terminal` as an object, `session.collectionType` as an array holding `FORGED-TYPE-5582`) THEN that field is absent from the report and the value is not in it', async () => {
    const text = await runReport({
      ...baseTop,
      terminal: { x: 'FORGED-TYPE-5582' },
      session: { ...baseSession, collectionType: ['FORGED-TYPE-5582'] },
    });
    const report = JSON.parse(text);
    expect(text).not.toContain('FORGED-TYPE-5582');
    expect(report.terminal).toBeUndefined();
    expect(report.session.collectionType).toBeUndefined();
    expect(report.session.noteCount).toBe(3);
  });

  it('5: WHEN the `error.message` holds the hostile OSC 52 value THEN the report message has no control character and no `UFdORUQ`, as today', async () => {
    const text = await runReport({
      ...baseTop,
      error: { name: 'TypeError', message: `bad ${HOSTILE.osc52Bel} ${HOSTILE.csi}`, stack: [] },
      session: baseSession,
    });
    const message: string = JSON.parse(text).error.message;
    expect(message).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(message).not.toContain('UFdORUQ');
    expect(message.length).toBeGreaterThan(0);
  });
});
