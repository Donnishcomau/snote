#!/usr/bin/env node
import * as nodeModule from 'node:module';
import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
try {
  const d = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'snote', 'compile-cache');
  mkdirSync(d, { recursive: true, mode: 0o700 });
  chmodSync(d, 0o700);
  nodeModule.enableCompileCache?.(d);
} catch {
  // start without the cache
}
await import('./snote-main.js');