import { keymap } from './keymap';
import { SECTIONS } from './help-sections';
import { editorFinishHint } from './editor-select';

/**
 * Build the plain-text lines for the Help overlay's wide (cols>=100) layout:
 * a fixed left/right section split, merged row-by-row into two columns.
 *
 * `rows` is accepted for signature symmetry with `cols` but not used to
 * truncate: the output is always 28 lines (fixed by the keymap's 34 entries),
 * which fits every target terminal height.
 */
export function layoutHelp(cols: number, rows: number, editor = 'nvim'): string[] {
  void rows;

  const groupLines = (sections: typeof SECTIONS): string[] => {
    const lines: string[] = [];
    for (const section of sections) {
      lines.push(section.name);
      const entries = keymap.filter((e) => section.actions.includes(e.action));
      for (const entry of entries) {
        lines.push(entry.key.padEnd(8) + '  ' + entry.description);
      }
    }
    return lines;
  };

  const leftLines = groupLines(SECTIONS.slice(0, 3));
  const rightLines = groupLines(SECTIONS.slice(3));

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
    'Found a bug? Run snote --report to save a report bundle.',
    'Editing: ' + editorFinishHint(editor),
  ];
}
