#!/usr/bin/env node
import * as nodeModule from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
try {
  nodeModule.enableCompileCache?.(join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'snote', 'compile-cache'));
} catch {
  // start without the cache
}
await import('./snote-main.js');