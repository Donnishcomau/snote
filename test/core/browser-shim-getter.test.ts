import { describe, it, expect, vi } from 'vitest';
import { installBrowserShim } from '../../src/core/browser-shim';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('browser-shim-getter', () => {
  it('1: WHEN installBrowserShim(t) runs on the target with the counting getter THEN reads is 0 afterwards', () => {
    let reads = 0;
    const t: any = {};
    Object.defineProperty(t, 'localStorage', {
      get() {
        reads++;
        return undefined;
      },
      configurable: true,
    });

    installBrowserShim(t);

    expect(reads).toBe(0);
  });

  it('2: WHEN installBrowserShim has run on that target THEN setItem/getItem work correctly', () => {
    let reads = 0;
    const t: any = {};
    Object.defineProperty(t, 'localStorage', {
      get() {
        reads++;
        return undefined;
      },
      configurable: true,
    });

    installBrowserShim(t);

    t.localStorage.setItem('k', 'v');
    expect(t.localStorage.getItem('k')).toBe('v');
    expect(t.localStorage.getItem('missing')).toBeNull();
  });

  it('3: WHEN t.localStorage is a plain property holding an object with setItem THEN after the shim t.localStorage is existing', () => {
    const existing = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() };
    const t: any = { localStorage: existing };

    installBrowserShim(t);

    expect(t.localStorage).toBe(existing);
  });

  it('4: WHEN the shim runs twice on the target with the counting getter and setItem is called between THEN after second run getItem still returns v and reads is still 0', () => {
    let reads = 0;
    const t: any = {};
    Object.defineProperty(t, 'localStorage', {
      get() {
        reads++;
        return undefined;
      },
      configurable: true,
    });

    installBrowserShim(t);
    t.localStorage.setItem('k', 'v');
    installBrowserShim(t);

    expect(t.localStorage.getItem('k')).toBe('v');
    expect(reads).toBe(0);
  });

  it('5: WHEN src/core/browser-shim.ts is read THEN it contains getOwnPropertyDescriptor(target, localStorage) and does not contain .localStorage as', () => {
    const shimPath = fileURLToPath(new URL('../../src/core/browser-shim.ts', import.meta.url));
    const content = fs.readFileSync(shimPath, 'utf-8');

    expect(content).toContain("getOwnPropertyDescriptor(target, 'localStorage')");
    expect(content).not.toContain('.localStorage as');
  });
});
