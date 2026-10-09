import { keymap } from './keymap';
import { SECTIONS } from './help-sections';
import { editorFinishHint } from './editor-select';

export interface HelpListLine {
  text: string;
  /** Number of leading characters that are a key (drawn in the accent colour). */
  keyLen: number;
  bold?: boolean;
}

/** Cut `s` to `w` characters, ending in an ellipsis when something was cut. */
export function cutLine(s: string, w: number): string {
  if (s.length <= w) return s;
  return w <= 1 ? s.slice(0, Math.max(0, w)) : s.slice(0, w - 1) + '…';
}

/** The one-column Help list: title, each section name with its keys, two footers. */
export function helpListLines(editor = 'nvim'): HelpListLine[] {
  const lines: HelpListLine[] = [{ text: 'Help - Keyboard Shortcuts', keyLen: 0, bold: true }];
  for (const section of SECTIONS) {
    lines.push({ text: section.name, keyLen: 0, bold: true });
    for (const e of keymap.filter((k) => section.actions.includes(k.action))) {
      lines.push({ text: e.key.padEnd(8) + '  ' + e.description, keyLen: 8 });
    }
  }
  lines.push({ text: 'Found a bug? Run snote --report to save a report bundle.', keyLen: 0 });
  lines.push({ text: 'Editing: ' + editorFinishHint(editor), keyLen: 0 });
  return lines;
}

/** Window of the list starting at `offset` (clamped), plus the counter line. */
export function helpListWindow(
  lines: HelpListLine[],
  offset: number,
  innerWidth: number,
  innerHeight: number,
): { shown: HelpListLine[]; counter: string; offset: number } {
  const visible = Math.max(1, innerHeight - 1);
  const start = Math.min(Math.max(0, offset), Math.max(0, lines.length - visible));
  const shown = lines
    .slice(start, start + visible)
    .map((l) => ({ ...l, text: cutLine(l.text, innerWidth) }));
  const last = start + shown.length;
  const counter = cutLine(`${start + 1}-${last}/${lines.length} j/k scroll`, innerWidth);
  return { shown, counter, offset: start };
}
