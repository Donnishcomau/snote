import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { r4Blocks } from './eslint.terminal-sink.mjs';
import { scopeBlocks } from './eslint.scope.mjs';
import { fsWriteBlocks } from './eslint.fs-write.mjs';
import { r1Blocks } from './eslint.process-scope.mjs';

// #191: every request goes through src/core/bounded-request.ts. Nothing else under src/ or vendor/ may
// use fetch (called, aliased, passed on or reached through globalThis) or import a raw http client.
export const NETWORK_GUARD = {
  name: 'network',
  files: ['src/**/*.{ts,tsx}', 'vendor/**/*.{ts,tsx}'],
  ignores: ['src/core/bounded-request.ts'],
  rules: {
    'no-restricted-globals': ['error', { name: 'fetch', message: 'use boundedRequest (src/core/bounded-request.ts)' }],
    'no-restricted-properties': ['error', { object: 'globalThis', property: 'fetch' }, { object: 'global', property: 'fetch' }],
    'no-restricted-imports': ['error', { paths: ['undici', 'node:http', 'node:https', 'http', 'https'] }],
  },
  exceptions: [
    { path: 'src/core/websocket-provider.ts', rules: ['no-restricted-imports'], reason: 'imports node:http and node:https for the websocket Agent only', issue: 196 },
  ],
};

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...r4Blocks,
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { 'no-debugger': 'error', 'no-only-tests': 'off', '@typescript-eslint/no-unused-vars': 'off' } },
  ...scopeBlocks(NETWORK_GUARD),
  ...r1Blocks,
  ...fsWriteBlocks,
];
