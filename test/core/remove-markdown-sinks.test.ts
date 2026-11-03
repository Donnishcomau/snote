/**
 * #620, CodeQL alert 4 (bad HTML filtering in the bundled remove-markdown): snote draws no HTML. What
 * remove-markdown returns reaches only terminal text after sanitizeForTerminal (Preview, the list row, the
 * status file title). This file pins that: no ESC, BEL or C1 byte reaches those sinks for a hostile note,
 * and the export writes the raw text, so it does not use remove-markdown.
 * One `it()` per numbered line (tests 1 to 3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import type { Note } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { sanitizeForTerminal } from '../../src/core/sanitize';
import { markdownBodyLine } from '../../src/core/md-inline';
import { noteRow } from '../../src/core/note-row';
import { buildStatus } from '../../src/core/status-file';
import { exportNote, exportText } from '../../src/core/export-note';
import { Preview } from '../../src/tui/Preview';

const OSC8 = '\u001b]8;;http://evil.test\u0007link\u001b]8;;\u0007';
const OSC52 = '\u001b]52;c;aGk=\u0007';
const SCRIPT = '<scr<script>ipt>x</script>';
const CONTENT = [SCRIPT, OSC8, OSC52].join('\n');
const TITLE_CONTENT = [`${OSC52}${OSC8} ${SCRIPT}`, OSC8].join('\n');

const BAD = /[\u001b\u0007\u0080-\u009f]/;
const stripColour = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');

function makeNote(content: string): Note {
  return {
    content,
    tags: [],
    systemTags: ['markdown'],
    deleted: false,
    creationDate: 1000,
    modificationDate: 1000,
  } as never;
}
const note = makeNote(CONTENT);
const titleNote = makeNote(TITLE_CONTENT);

describe('#620 remove-markdown output reaches only sanitized plain text', () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  it('1: WHEN a markdown note holding `<scr<script>ipt>x</script>`, an OSC 8 link and an OSC 52 write is rendered by Preview and noteRow(n, 40) runs for it and for a note whose first line is the hostile text THEN no ESC, BEL or C1 byte reaches the frame, the markdown body lines, the row titles or the row previews, and the frame shows `link` and neither `evil.test` nor `aGk=`', () => {
    const r = render(React.createElement(Preview, { note, width: 100, height: 24, rendered: true }));
    cleanup.push(() => r.unmount());
    const frame = stripColour(r.lastFrame() ?? '');
    expect(frame).toContain('link');
    expect(frame).not.toContain('evil.test');
    expect(frame).not.toContain('aGk=');
    expect(frame).not.toMatch(BAD);
    for (const line of sanitizeForTerminal(CONTENT).split('\n')) {
      expect(markdownBodyLine(line).text).not.toMatch(BAD);
    }
    for (const n of [note, titleNote]) {
      const row = noteRow(n, 40);
      expect(row.title).not.toMatch(BAD);
      for (const p of row.previewLines) expect(p).not.toMatch(BAD);
    }
  });

  it('2: WHEN buildStatus runs on a store holding the note whose first line is the hostile text THEN last.title is not empty and holds no ESC, BEL or C1 byte', () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'h1', note: titleNote } as never);
    const title = buildStatus(store.getState(), null).last?.title ?? '';
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toMatch(BAD);
  });

  it('3: WHEN exportNote writes the hostile-content note into a temp folder THEN the folder holds exactly one file whose text equals exportText(note) and holds `<scr<script>ipt>x</script>` unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-sinks-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = await exportNote(note, dir);
    expect(path.length).toBeGreaterThan(0);
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    const text = readFileSync(join(dir, files[0]), 'utf8');
    expect(text).toBe(exportText(note));
    expect(text).toContain(SCRIPT);
  });
});
