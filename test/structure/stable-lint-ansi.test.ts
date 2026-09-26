import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');

const testFilePath = join(REPO_ROOT, 'test/tui/markdown.test.tsx');
const testFileContent = readFileSync(testFilePath, 'utf8');

describe('stable lint-ansi test structure', () => {
  it('1: WHEN the test file is read THEN it contains neither temp-test-file nor join(src/tui', () => {
    expect(testFileContent).not.toContain('temp-test-file');
    expect(testFileContent).not.toContain("join('src/tui'");
  });

  it('2: WHEN the test file is read THEN it contains cwd: tmp, lint-ansi-test- and hex color', () => {
    expect(testFileContent).toContain('cwd: tmp');
    expect(testFileContent).toContain('lint-ansi-test-');
    expect(testFileContent).toContain('hex color');
  });

  it('3: WHEN the it( cases are counted THEN there are exactly 5 and the title 4: npm run lint:ansi exits 0 on the repo and exits 1 on a temp file containing color="#ff0000" is still there', () => {
    const matches = testFileContent.match(/it\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(5);
    expect(testFileContent).toContain(
      '4: npm run lint:ansi exits 0 on the repo and exits 1 on a temp file containing color="#ff0000"'
    );
  });

  it('4: WHEN fs.readdirSync(src/tui) is read after the whole file ran in the Gate THEN it contains App.tsx and no entry starts with temp-', async () => {
    // We run the test file via spawn so the gate runner also does this;
    // the acceptance check runs after the whole Gate, so we just verify
    // the directory state directly here.
    const srcTuiPath = join(REPO_ROOT, 'src/tui');
    if (existsSync(srcTuiPath)) {
      const entries = readdirSync(srcTuiPath);
      expect(entries).toContain('App.tsx');
      for (const entry of entries) {
        expect(entry.startsWith('temp-')).toBe(false);
      }
    }
  });

  it('5: WHEN every file under test/ ending in .test.ts or .test.tsx is read THEN none except test/structure/stable-lint-ansi.test.ts contains the text join(src/tui or join(src/core', async () => {
    const testDir = join(REPO_ROOT, 'test');
    const files: string[] = [];

    function walk(dir: string) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = require('fs').statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (/\.(test\.ts|test\.tsx)$/.test(entry)) {
          files.push(fullPath);
        }
      }
    }

    walk(testDir);

    expect(files.length).toBeGreaterThanOrEqual(100);

    const allowedFile = join(REPO_ROOT, 'test/structure/stable-lint-ansi.test.ts');

    for (const filePath of files) {
      if (filePath === allowedFile) continue;
      const content = readFileSync(filePath, 'utf8');
      expect(content).not.toContain("join('src/tui'");
      expect(content).not.toContain("join('src/core'");
    }
  });
});
