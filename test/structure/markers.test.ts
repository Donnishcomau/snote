import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('markers', () => {
  it('1: WHEN every .ts/.tsx file under src/ is read THEN at least 30 files were read, among them src/core/store.ts, src/cli/main.tsx and src/tui/Login.tsx, and every line that contains OMARCHY contains OMARCHY: boundary cast.', () => {
    const allFiles: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = dir + '/' + entry;
        const stat = require('node:fs').statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          allFiles.push(full);
        }
      }
    }
    walk('src');

    expect(allFiles.length).toBeGreaterThanOrEqual(30);
    const names = allFiles.map((f) => f.replace(process.cwd() + '/', ''));
    expect(names).toContain('src/core/store.ts');
    expect(names).toContain('src/cli/main.tsx');
    expect(names).toContain('src/tui/Login.tsx');

    for (const file of allFiles) {
      const content = read(file);
      for (const line of content.split('\n')) {
        if (line.includes('OMARCHY')) {
          expect(line).toContain('OMARCHY: boundary cast');
        }
      }
    }
  });

  it('2: WHEN those lines are counted THEN src/core/search.ts still has exactly 2 lines with OMARCHY: boundary cast and src/core/store.ts has exactly 2.', () => {
    const searchLines = read('src/core/search.ts').split('\n');
    const searchBoundary = searchLines.filter((l) => l.includes('OMARCHY: boundary cast'));
    expect(searchBoundary.length).toBe(2);

    const storeLines = read('src/core/store.ts').split('\n');
    const storeBoundary = storeLines.filter((l) => l.includes('OMARCHY: boundary cast'));
    expect(storeBoundary.length).toBe(2);
  });

  it('3: WHEN src/core/store.ts is read THEN it still contains store.forceSync = (), tracking: true and onClient: (c) => { client = c; }.', () => {
    const content = read('src/core/store.ts');
    expect(content).toContain('store.forceSync = () =>');
    expect(content).toContain('tracking: true');
    expect(content).toContain('onClient: (c) => { client = c; }');
  });

  it('4: WHEN src/core/simperium-reducer.ts is read THEN it still contains REMOVE_NOTE_ACTIONS, case \'CHANGE_CONNECTION_STATUS\' and pendingNotes.', () => {
    const content = read('src/core/simperium-reducer.ts');
    expect(content).toContain('REMOVE_NOTE_ACTIONS');
    expect(content).toContain("case 'CHANGE_CONNECTION_STATUS'");
    expect(content).toContain('pendingNotes');
  });

  it('5: WHEN the files under vendor/simplenote are read THEN at least 5 of them contain // OMARCHY: (markers in vendor/ are untouched).', () => {
    const filesWithMarkers: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = dir + '/' + entry;
        const stat = require('node:fs').statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          const content = read(full);
          if (content.includes('// OMARCHY:')) {
            filesWithMarkers.push(full);
          }
        }
      }
    }
    walk('vendor/simplenote');
    expect(filesWithMarkers.length).toBeGreaterThanOrEqual(5);
  });
});
