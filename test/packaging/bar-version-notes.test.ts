/**
 * Issue #159: the bar tooltip shows the installed version, an update names its
 * version, and `See notes` opens that release's page on GitHub. The tooltip
 * cannot hold a clickable link, so `See notes` is the right click on the bar
 * glyph. QML cannot run in vitest, so its functions are sliced out of
 * BarWidget.qml between marker comments and evaluated as plain JavaScript.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { makeStore } from '../../src/core/store';
import { buildStatus, clearUpdateStatusFile, watchStatus } from '../../src/core/status-file';
import { publishBanner, resetBanner } from '../../src/core/update-banner';
import { publishUpdate, resetUpdateSignal } from '../../src/core/update-signal';

const QML = path.join(process.cwd(), 'BarWidget.qml');
const text = (): string => fs.readFileSync(QML, 'utf8');
const NOW = 1700000120000;
const TODAYS_COMMAND = 'Update available: omarchy plugin update io.github.donnishcomau.snote-simplenote';

function between(begin: string, end: string): string {
  const t = text();
  const b = t.indexOf(begin);
  const e = t.indexOf(end);
  expect(b).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(b);
  return t.slice(b + begin.length, e);
}

interface Tooltip {
  formatTooltip: (status: unknown, nowMs: number, baseText: string, installed?: unknown) => string;
  notesUrl: (v: unknown) => string;
}

function tooltip(): Tooltip {
  const slice = between('// tooltip-format:begin', '// tooltip-format:end');
  return new Function(slice + '\nreturn { formatTooltip, notesUrl };')() as Tooltip;
}

const status = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  count: 3,
  last: { title: 'Groceries', modified: 0 },
  synced: new Date(NOW - 120000).toISOString(),
  alive: new Date(NOW - 5000).toISOString(),
  ...extra,
});

const lines = (s: string): string[] => s.split('\n');

/** Run `openNotes` with a fake `root` and a fake `Qt`; returns what it opened and ran. */
function pickSeeNotes(announced: unknown): { opened: string[]; ran: string[] } {
  const opened: string[] = [];
  const ran: string[] = [];
  const root = { announced, notesUrl: tooltip().notesUrl, bar: { run: (c: string) => ran.push(c) } };
  const Qt = { openUrlExternally: (u: string) => opened.push(u) };
  const slice = between('// notes-action:begin', '// notes-action:end');
  const { openNotes } = new Function('root', 'Qt', slice + '\nreturn { openNotes };')(root, Qt) as { openNotes: () => void };
  openNotes();
  return { opened, ran };
}

const tmpDirs: string[] = [];
afterEach(() => {
  resetUpdateSignal();
  resetBanner();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const readStatus = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

describe('issue #159 the bar shows the installed version and links the release notes', () => {
  it('1: WHEN snote is installed and current THEN the bar tooltip shows the installed version as `v<installed>` (e.g. `v0.2.8`)', () => {
    const { formatTooltip } = tooltip();
    expect(lines(formatTooltip(status(), NOW, 'base', '0.2.8'))[0]).toBe('snote v0.2.8 — 3 notes');
    expect(formatTooltip(null, NOW, 'snote — Simplenote in your terminal', '0.2.8')).toBe(
      'snote v0.2.8 — Simplenote in your terminal\nClick: open · Middle-click: new note'
    );
    // nothing known about the install: today's text, byte for byte
    expect(lines(formatTooltip(status(), NOW, 'base'))[0]).toBe('snote — 3 notes');
    expect(lines(formatTooltip(status(), NOW, 'base', ''))[0]).toBe('snote — 3 notes');
    const t = text();
    expect(t).toContain('root.formatTooltip(root.statusData, root.nowMs, root.defaultTooltip, root.installedVersion)');
    expect(t).toContain('/omarchy-snote-plugin/app/VERSION');
  });

  it('2: WHEN a newer release exists THEN the bar tooltip reads `Update available v<new>` (e.g. `Update available v0.2.9`) instead of the plugin-command line, followed by a second line `Right-click: See notes`', () => {
    const { formatTooltip } = tooltip();
    const out = formatTooltip(status({ update: 'available', updateVersion: '0.2.9' }), NOW, 'base', '0.2.8');
    expect(lines(out)).toEqual([
      'snote v0.2.8 — 3 notes',
      'Last: Groceries',
      'Synced 2m ago',
      'Update available v0.2.9',
      'Right-click: See notes',
      'Click: open · Middle-click: new note',
    ]);
    expect(out).not.toContain('omarchy plugin update');
    expect(lines(out)[lines(out).indexOf('Update available v0.2.9') + 1]).toBe('Right-click: See notes');
    const pressed = text().slice(text().indexOf('onPressed: function(b)'));
    expect(pressed.slice(0, pressed.indexOf('root.launchOrHint()'))).toContain(
      'if (b === Qt.RightButton) { root.openNotes(); return }'
    );
  });

  it('3: WHEN the user picks `See notes` THEN the browser opens `https://github.com/Donnishcomau/snote/releases/tag/v0.2.9`, and nothing else is run', () => {
    const picked = pickSeeNotes('0.2.9');
    expect(picked.opened).toEqual(['https://github.com/Donnishcomau/snote/releases/tag/v0.2.9']);
    expect(picked.ran).toEqual([]);
    expect(text()).not.toContain('Qt.openUrlExternally(root.statusData');
  });

  it('4: WHEN the version text is not plain digits and dots (`^\\d{1,6}\\.\\d{1,6}\\.\\d{1,6}$`) THEN no version and no link are shown, and the bar falls back to today\'s update line', () => {
    const { formatTooltip, notesUrl } = tooltip();
    const today = lines(formatTooltip(status({ update: 'available' }), NOW, 'base'));
    expect(today).toContain(TODAYS_COMMAND);
    for (const bad of ['0.2.9; rm -rf ~', '0.2.9\n', '1234567.0.0', '1.2', '1.2.3.4', 'v0.2.9', '<b>0.2.9</b>', '0.2.9 ', '0.2.9/../x', 7, null, ['0.2.9']]) {
      const out = formatTooltip(status({ update: 'available', updateVersion: bad }), NOW, 'base');
      expect(lines(out), JSON.stringify(bad)).toEqual(today);
      expect(out).not.toContain('See notes');
      expect(notesUrl(bad), JSON.stringify(bad)).toBe('');
      expect(pickSeeNotes(bad).opened, JSON.stringify(bad)).toEqual([]);
    }
    // an installed version that is not plain digits and dots is not shown either
    expect(lines(formatTooltip(status(), NOW, 'base', '0.2.8; touch x'))[0]).toBe('snote — 3 notes');
    expect(notesUrl('0.2.9')).toBe('https://github.com/Donnishcomau/snote/releases/tag/v0.2.9');
  });

  it('5: WHEN no update is available THEN no `See notes` action is shown', () => {
    const { formatTooltip } = tooltip();
    for (const extra of [
      {},
      { updateVersion: '0.2.9' },
      { update: 'restart', updateVersion: '0.2.9' },
      { update: 'available', updateVersion: '0.2.9', alive: new Date(NOW - 600000).toISOString() },
    ]) {
      const out = formatTooltip(status(extra), NOW, 'base', '0.2.8');
      expect(out, JSON.stringify(extra)).not.toContain('See notes');
      expect(out, JSON.stringify(extra)).not.toContain('Right-click');
      expect(out, JSON.stringify(extra)).not.toContain('Update available');
    }
    expect(pickSeeNotes('').opened).toEqual([]);
  });

  it('6: WHEN the update signal is `available` and the banner names `0.2.9`, or the signal is `restart` for `0.2.10` THEN status.json holds `updateVersion` `0.2.9` or `0.2.10` next to `update`, never a version that is not plain digits and dots, and a clean quit removes both', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-159-'));
    tmpDirs.push(dir);
    const file = path.join(dir, 'status.json');
    const state = makeStore({ stubClient: {} }).getState();
    expect(buildStatus(state, null, { kind: 'available' }, '0.2.9').updateVersion).toBe('0.2.9');
    expect(buildStatus(state, null, { kind: 'restart', available: '0.2.9' }, '0.2.9').update).toBe('restart');
    for (const bad of ['0.2.9; x', '1.2', '0.2.9\n', '']) {
      expect('updateVersion' in buildStatus(state, null, { kind: 'available' }, bad), bad).toBe(false);
    }
    expect('updateVersion' in buildStatus(state, null, null, '0.2.9')).toBe(false);
    // the writer: the signal says `available`, the banner names the release
    const store = makeStore({ stubClient: {} });
    const stop = watchStatus(store, dir, { delayMs: 10, heartbeatMs: 20 });
    try {
      publishUpdate({ kind: 'available' });
      publishBanner('0.2.8', '0.2.9');
      const waitFor = async (cond: () => boolean): Promise<void> => {
        const start = Date.now();
        while (!cond()) {
          if (Date.now() - start > 2000) throw new Error('timed out waiting for condition');
          await new Promise((r) => setTimeout(r, 10));
        }
      };
      await waitFor(() => readStatus(file)?.updateVersion === '0.2.9' && readStatus(file)?.update === 'available');
      // a downloaded update names its own version, not the banner's
      publishUpdate({ kind: 'restart', available: '0.2.10' });
      await waitFor(() => readStatus(file)?.updateVersion === '0.2.10' && readStatus(file)?.update === 'restart');
    } finally {
      stop();
    }
    clearUpdateStatusFile(dir);
    const quit = readStatus(file) as Record<string, unknown>;
    expect('update' in quit).toBe(false);
    expect('updateVersion' in quit).toBe(false);
  });
});
