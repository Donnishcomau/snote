import { checklistGlyphs } from './blog-markdown.js';

/**
 * Split a note into a blog title and markdown body.
 *
 * The title is the first non-blank line, trimmed, with one leading `# `
 * removed when present.
 * The markdown is the remaining lines (everything after the title line),
 * passed through `checklistGlyphs`.
 *
 * Throws when there is no title or the title is too long.
 */

export function noteToBlogDraft(content: string): { title: string; markdown: string } {
  const lines = content.split('\n');
  let titleLineIndex = -1;
  let titleLine = '';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      titleLineIndex = i;
      titleLine = trimmed;
      break;
    }
  }

  if (titleLineIndex === -1) {
    throw new Error('title is required');
  }

  // Strip one leading "# " if present
  let title = titleLine;
  if (title.startsWith('# ')) {
    title = title.slice(2);
  }

  if (title.length > 200) {
    throw new Error('title is too long');
  }

  const remainingLines = lines.slice(titleLineIndex + 1);
  const markdownBody = remainingLines.join('\n');
  const markdown = checklistGlyphs(markdownBody);

  return { title, markdown };
}
