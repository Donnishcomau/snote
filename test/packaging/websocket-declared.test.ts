/**
 * Issue #89 (F-87a): `websocket` is imported by src/core/websocket-provider.ts,
 * so package.json declares it at the version the lockfile already resolves
 * for simperium (it arrived only through simperium before).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));

describe('issue #89 websocket is a declared dependency', () => {
  it('1: WHEN package.json is read THEN `websocket` is a declared dependency at exactly the version the lockfile resolves for simperium (`1.0.31`)', () => {
    const pkg = read('package.json');
    const lock = read('package-lock.json');
    const resolved = lock.packages['node_modules/websocket'].version;
    expect(resolved).toBe('1.0.31');
    expect(lock.packages['node_modules/simperium'].dependencies.websocket).toBe(resolved);
    expect(pkg.dependencies.websocket).toBe('1.0.31');
    expect(pkg.dependencies.websocket).toBe(resolved);
    expect(lock.packages[''].dependencies.websocket).toBe(pkg.dependencies.websocket);
    expect(readFileSync('src/core/websocket-provider.ts', 'utf8')).toContain("from 'websocket'");
  });
});
