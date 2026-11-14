/**
 * #280: the R1 (process and websocket) and R4 (terminal sink) lint guards share ONE SELECTOR_RULE, exported by
 * eslint.scope.mjs, so the two copies cannot drift. Their behaviour is pinned by network-process-lint and
 * terminal-sink-lint, which this change leaves untouched.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { R1_PLUGIN } from '../../eslint.process-scope.mjs';
import { R4_PLUGIN } from '../../eslint.terminal-sink.mjs';
import { SELECTOR_RULE } from '../../eslint.scope.mjs';

describe('#280 one SELECTOR_RULE for the R1 and R4 guards', () => {
  it('1: WHEN every eslint*.mjs file at the repo root is read THEN `const SELECTOR_RULE =` is defined only in eslint.scope.mjs, once, and eslint.process-scope.mjs and eslint.terminal-sink.mjs import it from there', () => {
    const defs = readdirSync('.')
      .filter((f) => /^eslint.*\.mjs$/.test(f))
      .flatMap((f) => (readFileSync(f, 'utf8').match(/const SELECTOR_RULE =/g) ?? []).map(() => f));
    const imports = ['eslint.process-scope.mjs', 'eslint.terminal-sink.mjs'].filter((f) =>
      readFileSync(f, 'utf8').includes("import { scopeBlocks, SELECTOR_RULE } from './eslint.scope.mjs';")
    );
    expect({ defs, imports }).toEqual({ defs: ['eslint.scope.mjs'], imports: ['eslint.process-scope.mjs', 'eslint.terminal-sink.mjs'] });
  });

  it('2: WHEN the R1 and R4 plugins are loaded THEN each of their six rules is the shared SELECTOR_RULE object', () => {
    const rules = [...Object.values(R1_PLUGIN.rules), ...Object.values(R4_PLUGIN.rules)];
    expect({ count: rules.length, shared: rules.every((r) => r === SELECTOR_RULE) }).toEqual({ count: 6, shared: true });
  });
});
