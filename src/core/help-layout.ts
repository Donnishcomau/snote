import { keymap } from './keymap';
import { SECTIONS } from './help-sections';
import { editorFinishHint } from './editor-select';

/**
 * Build the plain-text lines for the Help overlay's wide (cols>=100) layout:
 * a fixed left/right section split, merged row-by-row into two columns.
 *
 * The wide output is always 30 lines (fixed by the keymap's 36 entries).
 * `rows` only matters below cols<100, where it bounds how many entry rows
 * each section gets, exactly like the overlay's own row budget.
 */
export function layoutHelp(cols: number, rows: number, editor = 'nvim'): string[] {
  const grouped = SECTIONS.map((section) => ({
    name: section.name,
    entries: keymap.filter((e) => section.actions.includes(e.action)),
  }));

  const sectionLines = (groups: typeof grouped): string[] => {
    const lines: string[] = [];
    for (const g of groups) {
      lines.push(g.name);
      for (const entry of g.entries) {
        lines.push(entry.key.padEnd(8) + '  ' + entry.description);
      }
    }
    return lines;
  };

  const footers = [
    'Found a bug? Run snote --report to save a report bundle.',
    'Editing: ' + editorFinishHint(editor),
  ];

  if (cols >= 100) {
    const leftLines = sectionLines(grouped.slice(0, 3));
    const rightLines = sectionLines(grouped.slice(3));
    const colWidth = Math.floor((cols - 4) / 2);
    const rowCount = Math.max(leftLines.length, rightLines.length);
    const mergedRows: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row = (leftLines[i] ?? '').padEnd(colWidth) + (rightLines[i] ?? '');
      mergedRows.push(row.replace(/\s+$/, ''));
    }
    return [
      'Help - Keyboard Shortcuts',
      ...mergedRows,
      ...footers,
    ];
  }

  // Narrow path: stack all sections in one column, sizing each section's
  // entry rows by its share of the available content height (the same
  // budget the overlay's Section component computes).
  const totalEntryRows = grouped.reduce((sum, g) => sum + g.entries.length, 0);
  const availableContent = Math.max(1, rows - 4 - grouped.length);
  const stacked: string[] = [];
  for (const g of grouped) {
    const maxRows = Math.max(1, Math.round((availableContent * g.entries.length) / totalEntryRows));
    stacked.push(g.name);
    for (const entry of g.entries.slice(0, maxRows)) {
      stacked.push(entry.key.padEnd(8) + '  ' + entry.description);
    }
  }

  return [
    'Help - Keyboard Shortcuts',
    ...stacked,
    ...footers,
  ];
}
