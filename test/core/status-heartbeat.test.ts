// F134: status.json carries a heartbeat so the bar can say "not running".
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { watchStatus } from '../../src/core/status-file';
import type { State } from '../../src/core/store';

const state = {
  data: { notes: new Map() },
  simperium: { connected: true, pendingNotes: {} },
} as unknown as State;
const store = { getState: () => state, subscribe: () => () => {} };

function formatTooltip(): (s: unknown, n: number, b: string) => string {
  const text = readFileSync(path.join(process.cwd(), 'BarWidget.qml'), 'utf8');
  const a = text.indexOf('// tooltip-format:begin');
  const b = text.indexOf('// tooltip-format:end');
  return new Function(text.slice(a, b) + '\nreturn formatTooltip;')() as never;
}
const SYNCED = '2023-11-14T22:13:20.000Z';
const NOW = Date.parse(SYNCED) + 2 * 86400000;

describe('F134 bar shows when snote is not running', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-hb-'));
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8'));

  it('1: WHEN watchStatus runs idle for 3 heartbeats of 30000 ms THEN `alive` and `synced` in status.json equal the latest time', () => {
    let t = Date.parse(SYNCED);
    const stop = watchStatus(store, dir, { now: () => t });
    for (let i = 0; i < 3; i++) {
      t += 30000;
      vi.advanceTimersByTime(30000);
    }
    const s = read();
    expect(s.alive).toBe(new Date(t).toISOString());
    expect(s.synced).toBe(new Date(t).toISOString());
    stop();
  });

  it('2: WHEN an idle watchStatus has run and stops THEN the file keys are exactly `alive`, `count`, `last`, `synced`, `version` and hold no note text', () => {
    const stop = watchStatus(store, dir, { now: () => Date.parse(SYNCED) });
    stop();
    vi.advanceTimersByTime(1000);
    const s = read();
    expect(Object.keys(s).sort()).toEqual(['alive', 'count', 'last', 'synced', 'version']);
    expect(s.alive).toBe(SYNCED);
  });

  it('3: WHEN alive is 2 days old and synced is `2023-11-14T22:13:20.000Z` two days earlier THEN the tooltip says `snote is not running · last synced 2d ago` and not `Synced`', () => {
    const out = formatTooltip()({ count: 1, last: null, synced: SYNCED, alive: SYNCED }, NOW, 'x');
    expect(out).toContain('snote is not running · last synced 2d ago');
    expect(out).not.toContain('Synced');
  });

  it('4: WHEN alive is 10 seconds old THEN the tooltip says `Synced 2d ago`; WHEN alive is 10 minutes old THEN it says `snote is not running`', () => {
    const f = formatTooltip();
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    expect(f({ count: 1, last: null, synced: SYNCED, alive: at(10000) }, NOW, 'x')).toContain('Synced 2d ago');
    expect(f({ count: 1, last: null, synced: SYNCED, alive: at(600000) }, NOW, 'x')).toContain('snote is not running');
  });
});
