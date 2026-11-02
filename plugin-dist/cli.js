#!/usr/bin/env node
import * as nodeModule from 'node:module';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
try {
  const d = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'snote', 'compile-cache');
  fs.mkdirSync(d, { recursive: true });
  if (!fs.lstatSync(d).isSymbolicLink()) {
    const fd = fs.openSync(d, fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    fs.fchmodSync(fd, 0o700);
    fs.closeSync(fd);
    nodeModule.enableCompileCache?.(d);
  }
} catch {}
await import('./snote-main.js');