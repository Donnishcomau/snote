/**
 * Lint for non-ANSI colors in src/tui.
 * Scans for hex colors, rgb(), ansi256, etc.
 * Exit 0 if ok, exit 1 with list of offenders otherwise.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC_TUI = 'src/tui';

// Patterns that violate the ANSI-only rule
const PATTERNS = [
  { regex: /#[0-9a-fA-F]{3,6}/, name: 'hex color' },
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
 * Check a file for violations.
 * Returns array of { file, line, pattern, content }.
 */
function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { regex, name } of PATTERNS) {
      if (regex.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          pattern: name,
          content: line.trim(),
        });
      }
    }
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
