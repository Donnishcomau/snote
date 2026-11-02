#!/usr/bin/env node
// CI shard proof (#369). Prints the test files of one vitest shard using vitest's OWN sequencer
// (never a re-implementation of its hash sort), or checks a JSON report against that shard.
//   node scripts/shard-files.mjs [k/n]                      print the shard (no argument: every file)
//   node scripts/shard-files.mjs --verify <report.json> k/n  compare the files vitest ran with the shard
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { createVitest } from 'vitest/node';

async function files(shard) {
  const ctx = await createVitest('test', { watch: false, ...(shard ? { shard } : {}) });
  try {
    const specs = await ctx.globTestSpecifications();
    const picked = shard ? await new ctx.config.sequence.sequencer(ctx).shard(specs) : specs;
    return [...new Set(picked.map((s) => relative(process.cwd(), s.moduleId)))].sort();
  } finally {
    await ctx.close();
  }
}

const args = process.argv.slice(2);
if (args[0] === '--verify') {
  const [, reportPath, shard] = args;
  let ran = [];
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    ran = (report.testResults ?? []).map((r) => relative(process.cwd(), r.name));
  } catch {
    ran = [];
  }
  const want = await files(shard);
  const got = new Set(ran);
  const wantSet = new Set(want);
  const missing = want.filter((f) => !got.has(f));
  const extra = [...got].filter((f) => !wantSet.has(f));
  if (got.size === 0) missing.push('(empty report)');
  if (missing.length || extra.length) {
    console.log(`SHARD MISMATCH ${shard}`);
    for (const f of missing) console.log(`missing ${f}`);
    for (const f of extra) console.log(`extra ${f}`);
  } else {
    console.log(`SHARD VERIFIED ${shard} ${want.length} files`);
  }
  process.exit(missing.length || extra.length ? 1 : 0);
} else {
  for (const f of await files(args[0])) console.log(f);
}
