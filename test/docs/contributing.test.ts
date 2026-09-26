import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../../src');
const { keymap } = await import(join(srcRoot, 'core/keymap'));

const doc = readFileSync('CONTRIBUTING.md', 'utf8');

describe('CONTRIBUTING.md — Reporting, issues, and PRs', () => {
  it('1: ## Reporting a bug comes before ## Writing a good issue, which comes before ## Pull requests, and each heading occurs exactly 1 time', () => {
    const reportingIdx = doc.indexOf('## Reporting a bug');
    const writingIdx = doc.indexOf('## Writing a good issue');
    const pullIdx = doc.indexOf('## Pull requests');
    expect(reportingIdx).toBeGreaterThan(-1);
    expect(writingIdx).toBeGreaterThan(-1);
    expect(pullIdx).toBeGreaterThan(-1);
    expect(reportingIdx).toBeLessThan(writingIdx);
    expect(writingIdx).toBeLessThan(pullIdx);
    expect(doc.split('## Reporting a bug').length - 1).toBe(1);
    expect(doc.split('## Writing a good issue').length - 1).toBe(1);
    expect(doc.split('## Pull requests').length - 1).toBe(1);
  });

  it('2: text between ## Reporting a bug and ## Writing a good issue contains snote --report and attach the report-*.json file it prints', () => {
    const start = doc.indexOf('## Reporting a bug');
    const end = doc.indexOf('## Writing a good issue');
    const snippet = doc.slice(start, end);
    expect(snippet).toContain('snote --report');
    expect(snippet).toContain('attach the report-*.json file it prints');
  });

  it('3: text between ## Writing a good issue and ## Pull requests contains steps to reproduce, terminal size and a failing test doubles the chance of a fix', () => {
    const start = doc.indexOf('## Writing a good issue');
    const end = doc.indexOf('## Pull requests');
    const snippet = doc.slice(start, end);
    expect(snippet).toContain('steps to reproduce');
    expect(snippet).toContain('terminal size');
    expect(snippet).toContain('a failing test doubles the chance of a fix');
  });

  it('4: text after ## Pull requests contains gh pr create and AGENTS.md', () => {
    const start = doc.indexOf('## Pull requests');
    const snippet = doc.slice(start);
    expect(snippet).toContain('gh pr create');
    expect(snippet).toContain('AGENTS.md');
  });

  it('5: doc is read THEN its first line starts with #', () => {
    const firstLine = doc.split('\n')[0];
    expect(firstLine.startsWith('#')).toBe(true);
  });
});
