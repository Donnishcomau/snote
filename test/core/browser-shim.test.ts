import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { installBrowserShim } from '../../src/core/browser-shim';

describe('browser-shim', () => {
  it('1: WHEN installBrowserShim(t) runs on empty obj THEN window, navigator.onLine, localStorage work', () => {
    // The acceptance text uses `t` as the variable name
    const t: any = {};
    installBrowserShim(t);

    // window.addEventListener should not throw
    expect(() => t.window.addEventListener('online', () => {})).not.toThrow();

    // navigator.onLine is true
    expect(t.navigator.onLine).toBe(true);

    // localStorage works
    t.localStorage.setItem('k', 'v1');
    expect(t.localStorage.getItem('k')).toBe('v1');
  });

  it('2: WHEN t is { navigator: {} } THEN onLine goes from undefined to true', () => {
    const t: any = { navigator: {} };
    expect(t.navigator.onLine).toBeUndefined();
    installBrowserShim(t);
    expect(t.navigator.onLine).toBe(true);
  });

  it('3: WHEN t already has window, navigator.onLine false, and localStorage THEN nothing changes', () => {
    const existingWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
    const existingLS = {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const t: any = {
      window: existingWindow,
      navigator: { onLine: false },
      localStorage: existingLS,
    };

    installBrowserShim(t);

    expect(t.window).toBe(existingWindow);
    expect(t.navigator.onLine).toBe(false);
    expect(t.localStorage).toBe(existingLS);
  });

  it('4: WHEN src/core/store imported THEN typeof globalThis.localStorage.setItem is function', async () => {
    // Re-import store to trigger browser-shim auto-install on globalThis
    const storeModule = await import('../../src/core/store');
    expect(storeModule).toBeDefined();

    expect(typeof globalThis.localStorage.setItem).toBe('function');
    globalThis.localStorage.setItem('x', '1');
    expect(globalThis.localStorage.getItem('x')).toBe('1');
  });

  it('5: WHEN src/core/store.ts is read THEN first import line contains ./browser-shim and no "from"', async () => {
    const storePath = path.resolve(__dirname, '../../src/core/store.ts');
    const content = fs.readFileSync(storePath, 'utf-8');
    const lines = content.split('\n');
    const firstImportLine = lines.find((line) => line.trimStart().startsWith('import '));
    expect(firstImportLine).toBeDefined();
    expect(firstImportLine).toContain('./browser-shim');
    expect(firstImportLine).not.toContain('from');
  });

  it('6: WHEN shim ran twice on same t THEN state preserved, missing returns null, remove works', () => {
    const t: any = {};
    installBrowserShim(t);

    t.localStorage.setItem('k', 'v1');

    // Run again - should be idempotent
    installBrowserShim(t);

    expect(t.localStorage.getItem('k')).toBe('v1');
    expect(t.localStorage.getItem('missing')).toBeNull();

    t.localStorage.removeItem('k');
    expect(t.localStorage.getItem('k')).toBeNull();
  });
});
