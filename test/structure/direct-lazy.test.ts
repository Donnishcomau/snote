/**
 * #556 L3: the direct download stays off the start path. No file under src/ imports
 * `direct-download` statically (`import ... from` or `export ... from`); only `await import()`
 * may load it. #30 L5c: inside it, release-verify is a static import (one lazy chunk, no second
 * dynamic-import wrapper), which stays off the start path because the whole module is lazy.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}
// `import x from`, `export ... from` and a bare `import '...'`; `await import(` is not matched
const STATIC = (name: string): RegExp => new RegExp(`(?:^|[;\\n}])\\s*(?:import|export)\\s*(?:[^;'"(]*?\\sfrom\\s*)?['"][^'"]*/${name}['"]`);

describe('#556 L3 direct download is lazy', () => {
  it('6: WHEN src/ is read THEN no file imports `direct-download` statically, and src/core/direct-download.ts imports `release-verify` statically, never through `await import(` (#30 L5c)', () => {
    const hits = files('src').filter((f) => STATIC('direct-download').test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
    const own = fs.readFileSync('src/core/direct-download.ts', 'utf8');
    expect(STATIC('release-verify').test(own)).toBe(true);
    expect(own).not.toContain("await import('./release-verify')");
  });
});
