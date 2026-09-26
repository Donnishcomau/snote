#!/usr/bin/env node
// Fake editor: appends "EDITED" to the file given as its last argument,
// unless FAKE_NOOP=1 is set in the environment.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const filePath = args[args.length - 1];

if (!filePath) {
  process.exit(1);
}

if (process.env.FAKE_NOOP === '1') {
  process.exit(0);
}

const content = readFileSync(filePath, 'utf-8');
writeFileSync(filePath, content + '\nEDITED', 'utf-8');
