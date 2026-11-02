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
