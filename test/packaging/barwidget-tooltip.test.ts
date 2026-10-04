// Acceptance tests for T359: the bar tooltip shows the live note count,
// the last note's title and the last sync time, read from the
// status.json the app publishes (T358). Until that file exists, the
// tooltip falls back to the old default text plus the click hint. The
// last note appears in the tooltip only — the bar label stays the
// icon-only glyph of T356, and the install/update tooltips are
// unchanged. QML cannot run in vitest, so the two pure formatter
// functions are sliced out of BarWidget.qml between their marker
// comments and evaluated as plain JavaScript; everything else is a
// structural text test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');

// Reference times from the fact sheet: Date.parse('2023-11-14T22:13:20.000Z')
// is 1700000000000, and the tests' nowMs is two minutes later.
const SYNCED = '2023-11-14T22:13:20.000Z';
const NOW = 1700000120000;

// Slice the plain JavaScript between the two marker comments and
// evaluate it: the functions there use no `root.`, `Qt.` or QML names,
// so `new Function` can hand them back for direct calls.
function formatters(): {
  formatAgo: (diffMs: number) => string;
  formatTooltip: (status: unknown, nowMs: number, baseText: string) => string;
} {
  const text = readFileSync(QML, 'utf8');
  const begin = text.indexOf('// tooltip-format:begin');
  const end = text.indexOf('// tooltip-format:end');
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const slice = text.slice(begin + '// tooltip-format:begin'.length, end);
  // eslint-disable-next-line no-new-func
  return new Function(slice + '\nreturn { formatAgo, formatTooltip };')() as {
    formatAgo: (diffMs: number) => string;
    formatTooltip: (status: unknown, nowMs: number, baseText: string) => string;
  };
}

describe('BarWidget.qml: status tooltip', () => {
  it('1: WHEN formatTooltip gets count 142, last title `Groceries`, synced `2023-11-14T22:13:20.000Z` THEN it returns `snote — 142 notes\\nLast: Groceries\\nSynced 2m ago\\nClick: open · Middle-click: new note`', () => {
    const { formatTooltip } = formatters();
    const status = { count: 142, last: { title: 'Groceries', modified: 0 }, synced: SYNCED };
    expect(formatTooltip(status, NOW, 'snote — Simplenote in your terminal')).toBe(
      'snote — 142 notes\nLast: Groceries\nSynced 2m ago\nClick: open · Middle-click: new note'
    );
  });

  it('2: WHEN it is called with `{ count: 1, last: null, synced: null }` THEN it returns exactly `snote — 1 note\\nNot synced yet\\nClick: open · Middle-click: new note`', () => {
    const { formatTooltip } = formatters();
    expect(formatTooltip({ count: 1, last: null, synced: null }, NOW, 'ignored base')).toBe(
      'snote — 1 note\nNot synced yet\nClick: open · Middle-click: new note'
    );
  });

  it('3: WHEN it is called with `null` and base text `snote — Simplenote in your terminal` THEN it returns exactly `snote — Simplenote in your terminal\\nClick: open · Middle-click: new note`', () => {
    const { formatTooltip } = formatters();
    expect(formatTooltip(null, NOW, 'snote — Simplenote in your terminal')).toBe(
      'snote — Simplenote in your terminal\nClick: open · Middle-click: new note'
    );
  });

  it('4: WHEN the synced time is 45 s, 3 h and 2 days before `nowMs` THEN the second lines are `Synced just now`, `Synced 3h ago` and `Synced 2d ago`', () => {
    const { formatTooltip } = formatters();
    const secondLine = (synced: string) =>
      formatTooltip({ count: 2, last: null, synced }, NOW, 'base').split('\n')[1];
    expect(secondLine(new Date(NOW - 45000).toISOString())).toBe('Synced just now');
    expect(secondLine(new Date(NOW - 3 * 60 * 60 * 1000).toISOString())).toBe('Synced 3h ago');
    expect(secondLine(new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString())).toBe('Synced 2d ago');
  });

  it('5: WHEN BarWidget.qml is read THEN it has `FileView {`, `watchChanges: true`, `printErrors: false`, `onFileChanged: reload()`, `onLoadFailed`, `SNOTE_STATUS_DIR`, `XDG_DATA_HOME`, `/omarchy-snote-plugin`, `status.json`', () => {
    const text = readFileSync(QML, 'utf8');
    expect(text).toContain('FileView {');
    expect(text).toContain('watchChanges: true');
    expect(text).toContain('printErrors: false');
    expect(text).toContain('onFileChanged: reload()');
    expect(text).toContain('onLoadFailed');
    expect(text).toContain('SNOTE_STATUS_DIR');
    expect(text).toContain('XDG_DATA_HOME');
    expect(text).toContain('/omarchy-snote-plugin');
    expect(text).toContain('status.json');
  });

  it('6: WHEN BarWidget.qml is read THEN `tooltipMessage` names `installTooltip`, `updateTooltip`, `formatTooltip(`; `statusFile.reload()` follows `function reprobe()`; `text:` is assigned `1` time', () => {
    const text = readFileSync(QML, 'utf8');
    const msg = text.slice(text.indexOf('readonly property string tooltipMessage'));
    const binding = msg.slice(0, msg.indexOf('\n\n'));
    expect(binding).toContain('installTooltip');
    expect(binding).toContain('updateTooltip');
    expect(binding).toContain('formatTooltip(');
    const reprobeAt = text.indexOf('function reprobe()');
    expect(reprobeAt).toBeGreaterThan(-1);
    expect(text.indexOf('statusFile.reload()', reprobeAt)).toBeGreaterThan(reprobeAt);
    expect(text.split('text:').length - 1).toBe(1);
  });
});
