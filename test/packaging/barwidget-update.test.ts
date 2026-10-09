// Acceptance tests for T389: the bar tooltip shows the update lines from
// status.json. When the app publishes an `update` key in status.json,
// `formatTooltip` in BarWidget.qml inserts the matching notice lines after
// the Synced line and before the click hint ('available' gets two lines,
// 'restart' gets one; any other value or a missing key changes nothing).
// The notice only names the steps: nothing updates by itself. QML cannot
// run in vitest, so the formatter is sliced out of BarWidget.qml between
// its marker comments and evaluated as plain JavaScript, same as the
// tooltip tests.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QML = join(process.cwd(), 'BarWidget.qml');

// Reference time from the fact sheet: Date.parse('2023-11-14T22:13:20.000Z')
// is 1700000000000, and NOW is two minutes later, so fixture F's sync time
// prints `Synced 2m ago`.
const NOW = 1700000120000;

// Fixture F: 3 notes, last "Groceries", synced two minutes before NOW.
const fixtureF = (update?: unknown) => ({
  count: 3,
  last: { title: 'Groceries', modified: 0 },
  synced: new Date(NOW - 120000).toISOString(),
  ...(update === undefined ? {} : { update }),
});

// Slice the plain JavaScript between the two marker comments and evaluate
// it: the functions there use no `root.`, `Qt.` or QML names, so
// `new Function` can hand them back for direct calls.
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
  return new Function(slice + '\nreturn { formatAgo, formatTooltip };')() as {
    formatAgo: (diffMs: number) => string;
    formatTooltip: (status: unknown, nowMs: number, baseText: string) => string;
  };
}

describe('BarWidget.qml: update notice in the status tooltip', () => {
  it('1: WHEN formatTooltip gets fixture F plus `update: \'available\'` THEN line index 3 of the result is exactly `Update available: omarchy plugin update io.github.donnishcomau.snote-simplenote`', () => {
    const { formatTooltip } = formatters();
    const result = formatTooltip(fixtureF('available'), NOW, 'ignored base');
    expect(result.split('\n')[3]).toBe(
      'Update available: omarchy plugin update io.github.donnishcomau.snote-simplenote'
    );
  });

  it('2: WHEN the same call is made THEN line 4 is exactly `then click this button and run omarchy-restart-shell` and line 5 is exactly `Click: open · Middle-click: new note`', () => {
    const { formatTooltip } = formatters();
    const lines = formatTooltip(fixtureF('available'), NOW, 'ignored base').split('\n');
    expect(lines[4]).toBe('then click this button and run omarchy-restart-shell');
    expect(lines[5]).toBe('Click: open · Middle-click: new note');
  });

  it('3: WHEN fixture F has no `update` key THEN the result is exactly `snote — 3 notes\\nLast: Groceries\\nSynced 2m ago\\nClick: open · Middle-click: new note`', () => {
    const { formatTooltip } = formatters();
    expect(formatTooltip(fixtureF(), NOW, 'ignored base')).toBe(
      'snote — 3 notes\nLast: Groceries\nSynced 2m ago\nClick: open · Middle-click: new note'
    );
  });

  it('4: WHEN fixture F has `update: \'bogus\'`, and again `update: null` THEN both results equal the result of line 3 exactly', () => {
    const { formatTooltip } = formatters();
    const withoutUpdate = formatTooltip(fixtureF(), NOW, 'ignored base');
    expect(formatTooltip(fixtureF('bogus'), NOW, 'ignored base')).toBe(withoutUpdate);
    expect(formatTooltip(fixtureF(null), NOW, 'ignored base')).toBe(withoutUpdate);
  });

  it('5: WHEN the status is `{ count: 1, last: null, synced: null, update: \'restart\' }` THEN line 2 of the result is exactly `Update downloaded: restart snote / the bar to use it`', () => {
    const { formatTooltip } = formatters();
    const status = { count: 1, last: null, synced: null, update: 'restart' };
    const lines = formatTooltip(status, NOW, 'ignored base').split('\n');
    expect(lines[2]).toBe('Update downloaded: restart snote / the bar to use it');
  });
});
