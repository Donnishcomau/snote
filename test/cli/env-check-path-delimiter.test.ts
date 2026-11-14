/**
 * #443: the Omarchy signal reads PATH with the same
 * separator findOnPath uses (`path.delimiter`), so both see the same folders.
 * The platform delimiter is ':' on Linux and macOS, so this file replaces it
 * with ';' to tell the two apart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:path', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:path')>();
  return { ...real, default: { ...real, delimiter: ';' }, delimiter: ';' };
});

import { envReport } from '../../src/cli/env-check';
import { restorePlatform, setPlatform } from '../helpers/platform';

const only = (...files: string[]) => (f: string): boolean => files.includes(f);

describe('#443 env check PATH delimiter', () => {
  beforeEach(() => setPlatform('linux')); // #447: the Linux rows, on any host
  afterEach(restorePlatform);

  it("1: WHEN path.delimiter is ';' and PATH is `/usr/share/omarchy/bin;/a` THEN nvim is found in /a and wl-copy and omarchy-launch-tui are `missing` (the Omarchy folder is seen); with PATH `/a;/x/omarchy-bin` they are `optional`", () => {
    expect(envReport({ PATH: '/usr/share/omarchy/bin;/a' }, only('/a/nvim'))).toBe(
      'ok       nvim: /a/nvim\nmissing  wl-copy\nmissing  omarchy-launch-tui'
    );
    expect(envReport({ PATH: '/a;/x/omarchy-bin' }, only('/a/nvim'))).toContain('optional wl-copy: not found');
  });
});
