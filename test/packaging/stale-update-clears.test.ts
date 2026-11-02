/**
 * Issue #157: after updating to the newest release the bar must not go on
 * saying "update available". Three causes are closed here: the tooltip no
 * longer repeats the notice of a snote that stopped, the bar looks at the
 * install again when a fresh status.json arrives or the widget is shown, and a
 * running snote that is the newest release does not write `update: available`.
 * QML cannot run in vitest, so its functions are sliced out of BarWidget.qml
 * between marker comments and evaluated as plain JavaScript with a fake `root`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { makeStore } from '../../src/core/store';
import { watchStatus } from '../../src/core/status-file';
import { currentBanner, markRunningNewest, resetBanner, runningIsNewestRelease } from '../../src/core/update-banner';
import type { GitRunner } from '../../src/core/update-check';
import { runUpdateChecks } from '../../src/core/update-run';
import { currentUpdate, resetUpdateSignal } from '../../src/core/update-signal';
import { pluginCloneDir } from '../../src/core/update-state';
import { startUpdateWatch } from '../../src/core/update-watch';

const QML = path.join(process.cwd(), 'BarWidget.qml');
const text = (): string => fs.readFileSync(QML, 'utf8');

const NOW = 1700000120000;

function between(begin: string, end: string): string {
  const t = text();
  const b = t.indexOf(begin);
  const e = t.indexOf(end);
  expect(b).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(b);
  return t.slice(b + begin.length, e);
}

function formatTooltip(status: unknown, nowMs: number): string {
  const slice = between('// tooltip-format:begin', '// tooltip-format:end');
  const f = new Function(slice + '\nreturn { formatTooltip };')() as {
    formatTooltip: (s: unknown, n: number, base: string) => string;
  };
  return f.formatTooltip(status, nowMs, 'base');
}

const fixture = (alive: number | null, update: string) => ({
  count: 3,
  last: { title: 'Groceries', modified: 0 },
  synced: new Date(NOW - 120000).toISOString(),
  ...(alive === null ? {} : { alive: new Date(alive).toISOString() }),
  update,
});

const tmpDirs: string[] = [];
const tmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-157-'));
  tmpDirs.push(d);
  return d;
};

afterEach(() => {
  resetUpdateSignal();
  resetBanner();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const waitFor = async (cond: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const readStatus = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** A plugin clone at `cloneVersion`, an origin whose HEAD differs from the clone's and whose newest release tag is `tag`. */
function fakeWorld(cloneVersion: string, tag: string): { home: string; run: GitRunner; tagCalls: { n: number } } {
  const home = tmp();
  const clone = pluginCloneDir(home);
  fs.mkdirSync(path.join(clone, 'plugin-dist'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'plugin-dist', 'VERSION'), `${cloneVersion}\n`);
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(clone, '.git', 'config'),
    '[remote "origin"]\n\turl = https://github.com/donnishcomau/snote.git\n'
  );
  const tagCalls = { n: 0 };
  const run: GitRunner = async (args) => {
    if (args.includes('--tags')) {
      tagCalls.n += 1;
      return { code: 0, stdout: `ccc\trefs/tags/v${tag}\n` };
    }
    if (args.includes('ls-remote')) return { code: 0, stdout: 'bbb\tHEAD\n' };
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'aaa\n' };
    if (args.includes('cat-file')) return { code: 1, stdout: '' };
    return { code: 0, stdout: '' };
  };
  return { home, run, tagCalls };
}

/** Start the update checks and the status writer for a snote running `version`; resolves with the status file after a write at `marker`. */
async function statusAfterChecks(version: string, tag: string, seeded: boolean): Promise<Record<string, unknown>> {
  const { home, run, tagCalls } = fakeWorld(version, tag);
  const dir = tmp();
  const file = path.join(dir, 'status.json');
  if (seeded) {
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, count: 0, last: null, synced: null, update: 'available', alive: new Date(NOW).toISOString() }) + '\n'
    );
  }
  let clock = NOW;
  const store = makeStore({ stubClient: {} });
  const stopStatus = watchStatus(store, dir, { delayMs: 10, heartbeatMs: 20, now: () => clock });
  await runUpdateChecks({ version, home, env: {}, stateDir: tmp(), run });
  const stopWatch = startUpdateWatch({ version, home, env: {}, run, schedule: () => () => {}, stateDir: tmp() });
  try {
    // both checks have answered: the HEAD check published `available`, the tag check was asked
    await waitFor(() => currentUpdate()?.kind === 'available' && tagCalls.n === 1);
    clock = NOW + 99000;
    const marker = new Date(clock).toISOString();
    await waitFor(() => readStatus(file)?.alive === marker);
    return readStatus(file) as Record<string, unknown>;
  } finally {
    stopWatch();
    stopStatus();
  }
}

describe('issue #157 the bar stops saying "update available" after the update', () => {
  it('1: WHEN setup has installed the newest release and the bar restarts, with a status.json whose `alive` is older than 120 s and holds `update: available` THEN the tooltip has no `Update available` line and the glyph colour does not depend on status.json', () => {
    const stale = formatTooltip(fixture(NOW - 600000, 'available'), NOW);
    expect(stale).not.toContain('Update available');
    expect(stale).toContain('snote is not running');
    const staleRestart = formatTooltip(fixture(NOW - 600000, 'restart'), NOW);
    expect(staleRestart).not.toContain('Update downloaded');
    // a running snote (fresh heartbeat) still announces it
    expect(formatTooltip(fixture(NOW - 5000, 'available'), NOW)).toContain('Update available');
    expect(text()).toContain('readonly property bool needsAttention: root.snoteStatus === "missing" || root.snoteStale');
  });

  it('2: WHEN setup finishes an update while the bar is running and snote writes a new status.json THEN the bar re-runs both probes, without reloading the status file, and also when the widget is shown', () => {
    const slice = between('// status-apply:begin', '// status-apply:end');
    const make = (needsAttention: boolean) => {
      const calls: string[] = [];
      const root = {
        statusData: null as unknown,
        needsAttention,
        reprobeVersion: () => calls.push('reprobeVersion'),
      };
      const fns = new Function('root', 'checkSnoteProc', 'checkVersionProc', slice + '\nreturn { applyStatus, reprobeVersion };');
      const procs = { snote: { running: false }, version: { running: false } };
      const real = fns(root, procs.snote, procs.version) as { applyStatus: (raw: string) => void; reprobeVersion: () => void };
      return { calls, root, procs, real };
    };
    const body = JSON.stringify({ count: 2, last: null, synced: null });
    const stale = make(true);
    stale.real.applyStatus(body);
    expect(stale.calls).toEqual(['reprobeVersion']);
    expect((stale.root.statusData as { count: number }).count).toBe(2);
    const current = make(false);
    current.real.applyStatus(body);
    expect(current.calls).toEqual([]);
    const started = make(false);
    started.real.reprobeVersion();
    expect(started.procs.snote.running).toBe(true);
    expect(started.procs.version.running).toBe(true);
    expect(text()).toContain('onVisibleChanged: if (visible) root.reprobe()');
    expect(text()).toContain('onLoaded: root.applyStatus(text())');
  });

  it('3: WHEN the running snote is the newest release THEN status.json holds no `update: available`, even if an older process wrote it before', async () => {
    const status = await statusAfterChecks('0.2.8', '0.2.8', true);
    expect(status.update).toBeUndefined();
    expect(status.alive).toBe(new Date(NOW + 99000).toISOString());
    expect(currentUpdate()?.kind).toBe('available');
    expect(runningIsNewestRelease()).toBe(true);
  });

  it('4: WHEN the running snote is older than the newest release THEN status.json keeps `update: available` and the tooltip of a running snote still shows `Update available`', async () => {
    const status = await statusAfterChecks('0.2.8', '0.2.9', true);
    expect(status.update).toBe('available');
    expect(runningIsNewestRelease()).toBe(false);
    expect(currentBanner()).toEqual({ running: '0.2.8', available: '0.2.9' });
    expect(formatTooltip({ ...fixture(NOW - 5000, 'available'), ...status }, NOW)).toContain('Update available');
    markRunningNewest(true);
    expect(runningIsNewestRelease()).toBe(true);
  });
});
