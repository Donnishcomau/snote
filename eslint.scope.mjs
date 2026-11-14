// Shared shape for "nothing else may use X" guards (snote #191; #194b adds a second one).
// scopeBlocks returns flat-config blocks: ONE guard block that no inline directive can switch off
// (noInlineConfig), and one block per temporary exception. An exception names its path, the rules it
// turns off, a reason and the issue that removes it; a guard test fails when the path is gone or no
// longer triggers its rules.
export function scopeBlocks({ name, files, ignores = [], rules, exceptions = [] }) {
  const guard = {
    name,
    files,
    ...(ignores.length > 0 ? { ignores } : {}),
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules,
  };
  const exempt = exceptions.map(({ path, rules: ruleNames, reason, issue }) => ({
    name: `${name}: exception for ${path} (#${issue}): ${reason}`,
    files: [path],
    rules: Object.fromEntries(ruleNames.map((r) => [r, 'off'])),
  }));
  return [guard, ...exempt];
}

// #280: the one SELECTOR_RULE: no-restricted-syntax under another name. Each option is { selector, message } and
// every node a selector matches is reported. The R1 (eslint.process-scope.mjs) and R4 (eslint.terminal-sink.mjs)
// guards register it under their own rule names, so they add to the other no-restricted-* guards instead of
// replacing them.
export const SELECTOR_RULE = {
  meta: { type: 'problem', schema: { type: 'array', items: { type: 'object' } } },
  create(context) {
    const listeners = {};
    for (const { selector, message } of context.options) {
      listeners[selector] = (node) => context.report({ node, message });
    }
    return listeners;
  },
};
