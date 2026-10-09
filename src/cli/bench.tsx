/**
 * T17: performance bench — generate notes, load, time first frame, search,
 * read memory, compare with thresholds.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import { EventEmitter } from 'node:events';

import React from 'react';
import { render } from 'ink';

import { saveState, loadState } from '../core/persistence';
import { makeStore } from '../core/store';
import { filterNotes } from '../core/search';
import { App } from '../tui/App';

// ---------------------------------------------------------------------------
// Public constants / types
// ---------------------------------------------------------------------------

export const THRESHOLDS = { startMs: 150, searchMs: 50, rssMb: 120 };

type BenchResult = {
  notes: number;
  matches: number;
  startMs: number;
  searchMs: number;
  rssMb: number;
};

// ---------------------------------------------------------------------------
// writeBenchState — build `count` notes and persist them
// ---------------------------------------------------------------------------

export function writeBenchState(dir: string, count: number): void {
  const notes = new Map<string, any>();
  const filler = 'lorem ipsum dolor sit amet '.repeat(30).slice(0, 120);

  for (let i = 0; i < count; i++) {
    const id = `bench-${i}`;
    notes.set(id, {
      content: `Note ${i} title\nneedle${i % 97} ${filler}`,
      creationDate: 1700000000,
      modificationDate: 1700000000 + i,
      deleted: false,
      systemTags: [] as string[],
      tags: [] as string[],
      publishURL: '',
      shareURL: '',
    });
  }

  saveState({ data: { notes } as never } as never, dir);
}

// ---------------------------------------------------------------------------
// failures — which thresholds were exceeded
// ---------------------------------------------------------------------------

export function failures(r: BenchResult): string[] {
  const out: string[] = [];
  if (r.startMs >= THRESHOLDS.startMs)
    out.push(`start ${r.startMs} ms >= ${THRESHOLDS.startMs} ms`);
  if (r.searchMs >= THRESHOLDS.searchMs)
    out.push(`search ${r.searchMs} ms >= ${THRESHOLDS.searchMs} ms`);
  if (r.rssMb >= THRESHOLDS.rssMb)
    out.push(`rss ${r.rssMb} MB >= ${THRESHOLDS.rssMb} MB`);
  return out;
}

// ---------------------------------------------------------------------------
// runBench — load, render first frame, time search, read RSS
// ---------------------------------------------------------------------------

class BenchOut extends EventEmitter {
  columns = 120;
  rows = 40;
  last = '';
  write = (frame: string): boolean => {
    this.last = frame;
    return true;
  };
}

class BenchIn extends EventEmitter {
  isTTY = true;
  setEncoding = (): void => {};
  setRawMode = (): void => {};
  resume = (): void => {};
  pause = (): void => {};
  ref = (): void => {};
  unref = (): void => {};
  read = (): null => null;
}

export async function runBench(
  dir: string,
  onFrame?: (frame: string) => void
): Promise<BenchResult> {
  const loaded = loadState(dir);
  if (!loaded) {
    throw new Error('no state.json in ' + dir);
  }

  const store = makeStore({ stubClient: {}, preloadedState: loaded });
  const out = new BenchOut();
  const instance = render(
    React.createElement(App, { store, width: 120, height: 40 }),
    {
      stdout: out as never,
      stderr: new BenchOut() as never,
      stdin: new BenchIn() as never,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  );
  const lastFrame = () => out.last;
  const unmount = () => instance.unmount();

  const notes = (loaded.data as any).notes as Map<string, any>;
  const noteCount = notes.size;

  // poll until the status bar shows "<count> notes" (a macrotask boundary so
  // the frame Ink painted is complete, not a partial line mid-layout)
  for (let i = 0; i < 2000; i++) {
    await new Promise((r) => setTimeout(r, 1));
    const frame = lastFrame();
    if (frame && frame.includes(`${noteCount} notes`)) {
      break;
    }
  }

  const startMs = performance.now();
  onFrame?.(out.last);

  const allNotes = [...notes.values()];
  const matches = filterNotes(allNotes, 'needle42 title');

  const searchEnd = performance.now();
  const rssMb = process.memoryUsage().rss / 1048576;

  unmount();

  return {
    notes: noteCount,
    matches: matches.length,
    startMs: Math.round(startMs * 10) / 10,
    searchMs: Math.round((searchEnd - startMs) * 10) / 10,
    rssMb: Math.round(rssMb * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// benchMain — CLI entry for the bench
// ---------------------------------------------------------------------------

export async function benchMain(argv: string[]): Promise<void> {
  const dir = argv[0] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-'));
  const r = await runBench(dir);
  console.log(JSON.stringify(r));
  process.exit(0);
}
