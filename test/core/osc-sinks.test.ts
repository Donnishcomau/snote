/**
 * T403: security fix step 2 (#10063) — three render sites that carried
 * outside text to the terminal unsanitised. The export file name now drops
 * DEL and C1 characters, and the notice line / login error are sanitised.
 */

import { readFileSync } from 'node:fs';

import { exportFileName } from '../../src/core/export-note';

describe('osc-sinks', () => {
  it('1: WHEN exportFileName(\'T\x9d52;c;AA\x9citle\x7f\') runs THEN it returns `T52;c;AAitle`', () => {
    expect(exportFileName('T\x9d52;c;AA\x9citle\x7f')).toBe('T52;c;AAitle');
  });

  it('2: WHEN exportFileName(\'Plain title\') runs THEN it returns `Plain title`', () => {
    expect(exportFileName('Plain title')).toBe('Plain title');
  });

  it('3: WHEN src/tui/App.tsx is read THEN it contains `sanitizeForTerminal(notice.message)`, does not contain `>{notice.message}<`, and trimEnd().split(\'\\n\').length is `247`', () => {
    const app = readFileSync('src/tui/App.tsx', 'utf8');
    expect(app).toContain('sanitizeForTerminal(notice.message)');
    expect(app).not.toContain('>{notice.message}<');
    expect(app.trimEnd().split('\n').length).toBe(247);
  });

  it('4: WHEN src/tui/Login.tsx is read THEN it contains `sanitizeForTerminal(error)` and does not contain `Error: {error}`', () => {
    const login = readFileSync('src/tui/Login.tsx', 'utf8');
    expect(login).toContain('sanitizeForTerminal(error)');
    expect(login).not.toContain('Error: {error}');
  });
});
