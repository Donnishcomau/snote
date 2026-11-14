/**
 * #443: off Omarchy (no `/omarchy/bin` folder on PATH, e.g. Homebrew on Ubuntu
 * or Fedora) `snote --check` lists `wl-copy` and `omarchy-launch-tui` as
 * optional with what each is for; on Omarchy a missing one stays `missing`.
 * The editor is required everywhere.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { envReport } from '../../src/cli/env-check';
import { restorePlatform, setPlatform } from '../helpers/platform';

const only = (...files: string[]) => (f: string): boolean => files.includes(f);

describe('#443 env check off Omarchy', () => {
  beforeEach(() => setPlatform('linux')); // #447: the Linux rows, on any host
  afterEach(restorePlatform);

  it("1: WHEN envReport({ PATH: '/a' }, only('/a/nvim')) runs (no Omarchy bin folder on PATH) THEN it returns exactly `ok       nvim: /a/nvim`, `optional wl-copy: not found (copies a note to the clipboard on Wayland)` and `optional omarchy-launch-tui: not found (opens snote from the Omarchy launcher)`", () => {
    expect(envReport({ PATH: '/a' }, only('/a/nvim'))).toBe(
      'ok       nvim: /a/nvim\n' +
        'optional wl-copy: not found (copies a note to the clipboard on Wayland)\n' +
        'optional omarchy-launch-tui: not found (opens snote from the Omarchy launcher)'
    );
  });

  it("2: WHEN PATH is `/a:/usr/share/omarchy/bin` or `/a:/h/.local/share/omarchy/bin/` THEN both are `missing`; with `/a:/x/omarchy-bin` they are `optional`; a missing editor is `missing  nvim` either way", () => {
    for (const PATH of ['/a:/usr/share/omarchy/bin', '/a:/h/.local/share/omarchy/bin/']) {
      expect(envReport({ PATH }, only('/a/nvim'))).toBe('ok       nvim: /a/nvim\nmissing  wl-copy\nmissing  omarchy-launch-tui');
    }
    expect(envReport({ PATH: '/a:/x/omarchy-bin' }, only('/a/nvim'))).toContain('optional wl-copy: not found');
    expect(envReport({ PATH: '/a' }, only()).split('\n')[0]).toBe('missing  nvim');
  });
});
