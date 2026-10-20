/**
 * chunk-keys slice 2 (F193): the bundle size is measured the same in any
 * checkout. esbuild's module path lines run through a symlinked node_modules'
 * target; bundleSize counts them as a normal checkout writes them.
 */
import { describe, expect, it } from 'vitest';

import { bundleSize } from '../helpers/bundle-size';

describe('bundle size measured the same in any checkout', () => {
  it('1: WHEN bundleSize gets the lines `// ../../Users/q/wt/node_modules/ink/build/App.js` and `  "../../Users/q/wt/node_modules/ink/build/App.js"(exports) {` THEN it returns the byte length of `// node_modules/ink/build/App.js` and `  "node_modules/ink/build/App.js"(exports) {`, `78`', () => {
    const linked =
      '// ../../Users/q/wt/node_modules/ink/build/App.js\n  "../../Users/q/wt/node_modules/ink/build/App.js"(exports) {\n';
    const normal = '// node_modules/ink/build/App.js\n  "node_modules/ink/build/App.js"(exports) {\n';
    expect(Buffer.byteLength(normal)).toBe(78);
    expect(bundleSize(linked)).toBe(78);
    expect(bundleSize(normal)).toBe(78);
  });

  it('2: WHEN bundleSize gets the text `// src/cli/main.tsx` plus a line `var s = "// ../x/node_modules/y";` THEN it returns that text\'s own byte length, `54` (only a path that starts a `// ` line or a wrapper key and climbs out with `../` is cut)', () => {
    const text = '// src/cli/main.tsx\nvar s = "// ../x/node_modules/y";\n';
    expect(Buffer.byteLength(text)).toBe(54);
    expect(bundleSize(text)).toBe(54);
  });
});
