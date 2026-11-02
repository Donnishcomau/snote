/**
 * Lint for non-ANSI colors in src/tui.
 * Scans for hex colors, rgb(), ansi256, etc.
 * #242: an issue reference such as #235 or #1234 (`#` and digits only) inside
 * a real comment is prose, not a hex colour; everything else is scanned as before.
 * Exit 0 if ok, exit 1 with list of offenders otherwise.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import ts from 'typescript';

const SRC_TUI = 'src/tui';

// A hex colour is `#` and a run of 3 or more hex digits (#f00, #f00f,
// #ff0000, #ff000080), the same lines the scan flagged before #242.
const HEX = /#[0-9a-fA-F]{3,}/g;

// The other patterns that violate the ANSI-only rule (comments included).
const PATTERNS = [
  { regex: /rgb\(/, name: 'rgb()' },
  { regex: /ansi256/, name: 'ansi256' },
  { regex: /hex\(/, name: 'hex()' },
  { regex: /bgHex\(/, name: 'bgHex()' },
];

/**
 * Recursively get all .ts and .tsx files in a directory.
 */
function getFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(fullPath));
    } else if (entry.isFile() && (extname(entry.name) === '.ts' || extname(entry.name) === '.tsx')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Where the real comments are (#242), as [start, end) offsets, found by
 * TypeScript's own parser: a `//` inside a string, a regex literal, a
 * template or JSX text is not a comment, and a quote in JSX text (don't)
 * does not open a string.
 */
function commentRanges(filePath, text) {
  const kind = extname(filePath) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
  const ranges = [];
  const visit = (node) => {
    // JSX text and JSDoc are not code: their text is never read as trivia.
    if (node.kind === ts.SyntaxKind.JsxText) return;
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sf);
    if (children.length > 0) {
      children.forEach(visit);
      return;
    }
    // A token: its comments sit in the trivia between its full start and its text.
    const trivia = [
      ...(ts.getTrailingCommentRanges(text, node.pos) ?? []),
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
    ];
    for (const r of trivia) ranges.push([r.pos, r.end]);
  };
  visit(sf);
  return ranges;
}

/**
 * The one exemption (#242): `#` and digits only (#235, #1234), inside a real
 * comment. Any other hex run, or a digit run outside a comment, is a colour.
 */
function isIssueRef(match, offset, comments) {
  return /^#[0-9]+$/.test(match) && comments.some(([start, end]) => offset >= start && offset < end);
}

/**
 * Check a file for violations.
 * Returns array of { file, line, pattern, content }.
 */
function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const comments = commentRanges(filePath, content);
  const violations = [];
  let lineStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const report = (name) => violations.push({
      file: filePath,
      line: i + 1,
      pattern: name,
      content: line.trim(),
    });
    if ([...line.matchAll(HEX)].some((m) => !isIssueRef(m[0], lineStart + m.index, comments))) {
      report('hex color');
    }
    for (const { regex, name } of PATTERNS) {
      if (regex.test(line)) report(name);
    }
    lineStart += line.length + 1;
  }

  return violations;
}

/**
 * Main function.
 */
function main() {
  const files = getFiles(SRC_TUI);
  const allViolations = [];
  
  for (const file of files) {
    allViolations.push(...checkFile(file));
  }
  
  if (allViolations.length === 0) {
    console.log('ansi ok');
    process.exit(0);
  } else {
    console.error('Non-ANSI color violations found:');
    for (const v of allViolations) {
      console.error(`${v.file}:${v.line} - ${v.pattern}: ${v.content}`);
    }
    process.exit(1);
  }
}

main();
