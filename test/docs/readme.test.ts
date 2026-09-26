import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../../src');
const { keymap } = await import(join(srcRoot, 'core/keymap'));

const readme = readFileSync('README.md', 'utf8');

function keyRow(entry: { key: string; description: string }): string {
  return '| `' + entry.key + '` | ' + entry.description + ' |';
}

describe('README — Install on Omarchy and Keys', () => {
  it('1: ## Install on Omarchy comes before ## Keys, ## Keys comes before ## Develop, each heading occurs exactly 1 time', () => {
    const installIdx = readme.indexOf('## Install on Omarchy');
    const keysIdx = readme.indexOf('## Keys');
    const developIdx = readme.indexOf('## Develop');
    expect(installIdx).toBeGreaterThan(-1);
    expect(keysIdx).toBeGreaterThan(-1);
    expect(developIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeLessThan(keysIdx);
    expect(keysIdx).toBeLessThan(developIdx);
    expect(readme.split('## Install on Omarchy').length - 1).toBe(1);
    expect(readme.split('## Keys').length - 1).toBe(1);
  });

  it('2: contains install steps, hotkey bind, and bindings.lua path', () => {
    expect(readme).toContain('sh packaging/omarchy/install.sh');
    expect(readme).toContain('npm run build');
    expect(readme).toContain(
      'o.bind("SUPER + SHIFT + N", "Simplenote", "omarchy-launch-tui --app-id=TUI.float snote")'
    );
    expect(readme).toContain('~/.config/hypr/bindings.lua');
  });

  it('3: text between ## Install on Omarchy and ## Keys contains snote --check, wl-copy and ANSI', () => {
    const start = readme.indexOf('## Install on Omarchy');
    const end = readme.indexOf('## Keys');
    const snippet = readme.slice(start, end);
    expect(snippet).toContain('snote --check');
    expect(snippet).toContain('wl-copy');
    expect(snippet).toContain('ANSI');
  });

  it('4: ## Keys section contains rows for j, k, Enter, e, n, q, ? with correct descriptions', () => {
    const baseKeys = ['j', 'k', 'Enter', 'e', 'n', 'q', '?'];
    const start = readme.indexOf('## Keys');
    const end = readme.indexOf('## Develop');
    const keysSection = readme.slice(start, end);
    expect(keysSection).toContain('| Key | Action |');
    const filtered = keymap.filter((e) => baseKeys.includes(e.key));
    for (const entry of filtered) {
      const row = keyRow(entry);
      expect(keysSection).toContain(row);
    }
  });

  it('5: ## Keys section contains "Press ? in the app" and at least 7 lines starting with "| "', () => {
    const start = readme.indexOf('## Keys');
    const end = readme.indexOf('## Develop');
    const keysSection = readme.slice(start, end);
    expect(keysSection).toContain('Press ? in the app for the current list.');
    const pipeLines = keysSection
      .split('\n')
      .filter((line) => line.trimStart().startsWith('| '));
    expect(pipeLines.length).toBeGreaterThanOrEqual(7);
  });

  it('6: first line starts with "# snote" and retains existing sections and make check', () => {
    expect(readme.split('\n')[0]).toMatch(/^# snote/);
    expect(readme).toContain('make check');
  });
});
