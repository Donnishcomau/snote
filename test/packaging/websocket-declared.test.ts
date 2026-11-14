/**
 * #615 item 3 (owner, 9 Nov): the Apache-2.0 `websocket` package must not ship in the GPL-2.0-only build. snote no longer
 * declares it (#89 declared it while src/core/websocket-provider.ts imported it) and nothing under src/ or vendor/ imports
 * it. It stays in node_modules only as simperium's own dependency, which the build answers with a stub
 * (test/cli/bundle-websocket-client.test.ts).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.(ts|tsx|js|mjs)$/.test(n) ? [join(dir, n)] : []));

describe('#615 websocket is not a declared dependency', () => {
  it('1: WHEN package.json and its lockfile are read THEN `websocket` is in none of the root dependencies or devDependencies, and simperium still asks for `1.0.31`', () => {
    const pkg = read('package.json');
    const lock = read('package-lock.json');
    expect([pkg.dependencies?.websocket, pkg.devDependencies?.websocket, lock.packages[''].dependencies?.websocket, lock.packages[''].devDependencies?.websocket]).toEqual([undefined, undefined, undefined, undefined]);
    expect(lock.packages['node_modules/simperium'].dependencies.websocket).toBe('1.0.31');
  });

  it("2: WHEN every source file under src/ and vendor/ is read THEN none imports or requires `websocket` (`from 'websocket'`, `require('websocket')`, `import('websocket')`)", () => {
    const hits = [...files('src'), ...files('vendor')].filter((f) => /from\s+['"]websocket['"/]|require\(\s*['"]websocket['"/]|import\(\s*['"]websocket['"/]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
