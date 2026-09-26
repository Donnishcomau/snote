import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const readme = readFileSync('README.md', 'utf8');

function extractSection(readme: string, heading: string): string {
  const start = readme.indexOf('## ' + heading);
  expect(start).toBeGreaterThan(-1);
  const nextHeading = readme.indexOf('## ', start + 4);
  const end = nextHeading === -1 ? readme.length : nextHeading;
  return readme.slice(start, end);
}

describe('README — public-facing sections (T280)', () => {
  it('1: ## First run and login exists and contains Tab and password', () => {
    const section = extractSection(readme, 'First run and login');
    expect(section).toContain('Tab');
    expect(section).toContain('password');
  });

  it('2: ## Launcher exists and contains required launcher terms', () => {
    const section = extractSection(readme, 'Launcher');
    expect(section).toContain('omarchy-tui-install');
    expect(section).toContain('Install > TUI');
    expect(section).toContain('{ tui = "snote", focus = true }');
    expect(section).toContain('omarchy-launch-or-focus-tui snote');
  });

  it('3: ## Editor exists and contains Omawrite and SNOTE_EDITOR', () => {
    const section = extractSection(readme, 'Editor');
    expect(section).toContain('Omawrite');
    expect(section).toContain('SNOTE_EDITOR');
  });

  it('4: ## Reporting a bug exists and contains snote --report and CONTRIBUTING.md', () => {
    const section = extractSection(readme, 'Reporting a bug');
    expect(section).toContain('snote --report');
    expect(section).toContain('CONTRIBUTING.md');
  });

  it('5: ## Credit and licence exists and contains GPLv2 and NOTICE', () => {
    const section = extractSection(readme, 'Credit and licence');
    expect(section).toContain('GPLv2');
    expect(section).toContain('NOTICE');
  });

  it('6: text between ## Install on Omarchy and ## Keys contains packaging/aur/PKGBUILD', () => {
    const installStart = readme.indexOf('## Install on Omarchy');
    const keysStart = readme.indexOf('## Keys');
    const installSection = readme.slice(installStart, keysStart);
    expect(installSection).toContain('packaging/aur/PKGBUILD');
  });
});
