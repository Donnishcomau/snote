/**
 * Rewrite markdown checklist lines to use checkbox glyphs.
 *
 * A line that is `- [ ] ` plus text becomes `- ☐ ` plus that text.
 * A line that is `- [x] ` or `- [X] ` plus text becomes `- ☑ ` plus that text.
 * Every other line is copied unchanged.
 */

const CHECKBOX_UNCHECKED = /^- \[ \] (.+)$/;
const CHECKBOX_CHECKED = /^- \[[xX]\] (.+)$/;

export function checklistGlyphs(content: string): string {
  const lines = content.split('\n');
  const result = lines.map((line) => {
    const uncheckedMatch = line.match(CHECKBOX_UNCHECKED);
    if (uncheckedMatch) {
      return '- ☐ ' + uncheckedMatch[1];
    }
    const checkedMatch = line.match(CHECKBOX_CHECKED);
    if (checkedMatch) {
      return '- ☑ ' + checkedMatch[1];
    }
    return line;
  });
  return result.join('\n');
}
