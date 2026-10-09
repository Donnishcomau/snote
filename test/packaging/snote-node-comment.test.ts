// Acceptance tests for T422. The old comments in packaging/omarchy/setup
// claimed SNOTE_NODE "exists ONLY for the tests" and that "real users
// never have it set", but the generated shim honours SNOTE_NODE at run
// time for whoever runs snote. Behaviour is unchanged; the comments now
// say who SNOTE_NODE serves. Each assertion below is written on a single
// physical line.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Literal for the shim heredoc's candidate loop line, rebuilt from parts
// because this editor's write path cannot carry a backslash before the
// dollar here: 'for candidate in "\${SNOTE_NODE:-}" /usr/bin/node; do'
const LOOP = 'for candidate in "' + '\\' + '${SNOTE_NODE:-}" /usr/bin/node; do';
// find_node's own guard, unescaped in setup (outside any heredoc):
// 'if [ -n "${SNOTE_NODE:-}" ]; then'
const GUARD = 'if [ -n "' + '$' + '{SNOTE_NODE:-}" ]; then';

it('1: WHEN packaging/omarchy/setup is read THEN it contains neither `exists ONLY for the tests` nor `real users never have it set`', () => {
  expect(readFileSync('packaging/omarchy/setup', 'utf8')).not.toContain('exists ONLY for the tests');
  expect(readFileSync('packaging/omarchy/setup', 'utf8')).not.toContain('real users never have it set');
});

it('2: WHEN its comment lines (starting with `#`) are read THEN at least one contains `SNOTE_NODE` and `run time`, and at least one contains `SNOTE_NODE` and `environment`', () => {
  const comments = readFileSync('packaging/omarchy/setup', 'utf8').split('\n').filter((line) => line.startsWith('#'));
  expect(comments.some((line) => line.includes('SNOTE_NODE') && line.includes('run time'))).toBe(true);
  expect(comments.some((line) => line.includes('SNOTE_NODE') && line.includes('environment'))).toBe(true);
});

it('3: WHEN it is read THEN it still contains `for candidate in "\\${SNOTE_NODE:-}" /usr/bin/node; do` and `if [ -n "${SNOTE_NODE:-}" ]; then`', () => {
  expect(readFileSync('packaging/omarchy/setup', 'utf8')).toContain(LOOP);
  expect(readFileSync('packaging/omarchy/setup', 'utf8')).toContain(GUARD);
});
