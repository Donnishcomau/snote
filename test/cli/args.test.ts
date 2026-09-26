import { describe, it, expect, vi } from 'vitest';
import { parseCli, checkReport, USAGE } from '../../src/cli/args';

describe('CLI args', () => {
  it('1: WHEN parseCli([]) is called THEN defaults are all false/undefined', () => {
    const result = parseCli([]);
    expect(result).toEqual({
      check: false,
      logout: false,
      help: false,
      dataDir: undefined,
      appId: undefined,
      server: undefined,
    });
    expect(Object.keys(result)).toHaveLength(6);
  });

  it('2: WHEN parseCli with all flags THEN values are set correctly', () => {
    const result = parseCli([
      '--check',
      '--data-dir',
      '/x',
      '--app-id',
      'a1',
      '--server=ws://localhost:9',
    ]);
    expect(result).toEqual({
      check: true,
      logout: false,
      help: false,
      dataDir: '/x',
      appId: 'a1',
      server: 'ws://localhost:9',
    });
  });

  it('3: WHEN -h and --logout are called THEN help and logout are set correctly', () => {
    const result1 = parseCli(['-h']);
    expect(result1.help).toBe(true);
    expect(result1.logout).toBe(false);

    const result2 = parseCli(['--logout']);
    expect(result2.logout).toBe(true);
    expect(result2.help).toBe(false);
  });

  it('4: WHEN unknown flag, missing value, and positional argument THEN each throws', () => {
    expect(() => parseCli(['--nope'])).toThrow();
    expect(() => parseCli(['--nope'])).toThrowError('--nope');

    expect(() => parseCli(['--data-dir'])).toThrow();
    expect(() => parseCli(['--data-dir'])).toThrowError('--data-dir');

    expect(() => parseCli(['extra'])).toThrow();
    expect(() => parseCli(['extra'])).toThrow('extra');
  });

  it('5: WHEN checkReport is called THEN returns exactly three lines', () => {
    const result = checkReport({ editor: 'nvim', dataDir: '/d', columns: 80, rows: 24 });
    expect(result).toBe('editor: nvim\ndata dir: /d\nterminal: 80x24');
  });

  it('6: WHEN USAGE is read THEN first line and all flags present', () => {
    expect(USAGE.split('\n')[0]).toBe('usage: snote [options]');
    expect(USAGE).toContain('--check');
    expect(USAGE).toContain('--logout');
    expect(USAGE).toContain('--help');
    expect(USAGE).toContain('-h');
    expect(USAGE).toContain('--data-dir');
    expect(USAGE).toContain('--app-id');
    expect(USAGE).toContain('--server');
  });
});
