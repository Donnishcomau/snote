import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const notice = readFileSync('NOTICE', 'utf8');
const lines = notice.split('\n');

describe('NOTICE — upstream attribution (T268)', () => {
  it('1: WHEN NOTICE is read THEN it is non-empty and its first line is exactly NOTICE', () => {
    expect(notice.length).toBeGreaterThan(0);
    expect(lines[0]).toBe('NOTICE');
  });

  it('2: WHEN NOTICE is read THEN it contains Automattic, Inc. and https://github.com/Automattic/simplenote-electron', () => {
    expect(notice).toContain('Automattic, Inc.');
    expect(notice).toContain('https://github.com/Automattic/simplenote-electron');
  });

  it('3: WHEN NOTICE is read THEN it contains GNU General Public License and GPLv2', () => {
    expect(notice).toContain('GNU General Public License');
    expect(notice).toContain('GPLv2');
  });

  it('4: WHEN NOTICE is read THEN it contains vendor/simplenote/', () => {
    expect(notice).toContain('vendor/simplenote/');
  });

  it('5: WHEN NOTICE is read THEN it contains modified and OMARCHY', () => {
    expect(notice).toContain('modified');
    expect(notice).toContain('OMARCHY');
  });
});
