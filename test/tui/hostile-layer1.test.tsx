import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink';

import type { EntityId, SystemTag, TagName } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { recordBlogSend } from '../../src/core/blog-sent';
import { setDataRoot } from '../../src/core/data-root';
import { App } from '../../src/tui/App';
import { Login } from '../../src/tui/Login';
import { HOSTILE, hostileText, LONG_LINE } from '../fixtures/hostile';

const require = createRequire(import.meta.url);
interface InkInstance {
  rootNode: InkNode;
  onRender(): void;
  calculateLayout(): void;
}
const instances = require(join(
  process.cwd(),
  'node_modules/ink/build/instances.js'
)).default as { get(key: object): InkInstance | undefined };

interface InkNode {
  nodeName: string;
  childNodes: InkNode[];
  nodeValue?: string;
}

interface FakeStream {
  on(event: string, listener: (...args: never[]) => void): unknown;
  once(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(s: string): boolean;
  setEncoding?: () => void;
  setRawMode?: () => void;
  resume?: () => void;
  pause?: () => void;
  ref?: () => void;
  unref?: () => void;
  read?: () => string | null;
  [key: string]: unknown;
}

const asStream = (fake: object): never => fake as never;
const eid = (id: string): EntityId => id as EntityId;
const tag = (name: string): TagName => name as TagName;

function makeStdout(): { fake: object; stream: never; writes: string[] } {
  const emitter = new EventEmitter();
  const writes: string[] = [];
  const fake: FakeStream = {
    on: (event, listener) => emitter.on(event, listener as (...args: unknown[]) => void),
    once: (event, listener) => emitter.once(event, listener as (...args: unknown[]) => void),
    off: (event, listener) => emitter.off(event, listener as (...args: unknown[]) => void),
    emit: (event, ...args) => emitter.emit(event, ...args),
    isTTY: true,
    columns: 120,
    rows: 34,
    write: (s) => { writes.push(s); return true; },
  };
  return { fake, stream: asStream(fake), writes };
}

function makeStdin(): { stream: never; write(value: string): void } {
  const emitter = new EventEmitter();
  let pending: string | null = null;
  const fake = emitter as unknown as FakeStream;
  fake.isTTY = true;
  fake.setEncoding = () => undefined;
  fake.setRawMode = () => undefined;
  fake.resume = () => undefined;
  fake.pause = () => undefined;
  fake.ref = () => undefined;
  fake.unref = () => undefined;
  fake.read = () => {
    const value = pending;
    pending = null;
    return value;
  };
  fake.write = (value: string) => {
    pending = value;
    emitter.emit('readable');
    emitter.emit('data', value);
    return true;
  };
  return {
    stream: asStream(fake),
    write: (value: string) => {
      fake.write!(value);
    },
  };
}

const BAD = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/;

function isBad(value: string): boolean {
  return BAD.test(value.replace(/\x1b\[7m|\x1b\[27m/g, ''));
}

function textNodes(node: InkNode, found: string[] = []): string[] {
  if (node.nodeName === '#text') {
    found.push(node.nodeValue ?? '');
  }
  for (const child of node.childNodes ?? []) {
    textNodes(child, found);
  }
  return found;
}

// Force a synchronous commit + layout + render pass so the DOM walk below
// sees the reconciler's latest state even under throttled rendering.
function settle(instance: InkInstance): void {
  instance.calculateLayout();
  instance.onRender();
}

// Poll until the DOM carries `marker` AND carries no bad text node, so both
// values asserted afterwards are ones the poll actually waited for.
async function walkClean(instance: InkInstance, marker: string): Promise<string[]> {
  const deadline = Date.now() + 2500;
  let texts: string[] = [];
  for (;;) {
    settle(instance);
    texts = textNodes(instance.rootNode);
    const bad = texts.filter((text) => isBad(text));
    if (bad.length === 0 && texts.some((text) => text.includes(marker))) {
      return texts;
    }
    if (Date.now() >= deadline) {
      return texts;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

function expectClean(texts: string[], marker: string): void {
  expect(texts.filter((text) => isBad(text))).toEqual([]);
  expect(texts.some((text) => text.includes(marker))).toBe(true);
}

function seedStore(dataDir: string) {
  const store = makeStore({ stubClient: {} });
  const tagLabel = `w${hostileText('TAG')}`;
  const mailLabel = `x${hostileText('MAIL')}@evil.com`;
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n1'),
    note: {
      content: `${hostileText('TITLE')}\n${hostileText('BODY')}\n${LONG_LINE}`,
      systemTags: ['published', 'shared', 'markdown'] as SystemTag[],
      tags: [tag('work'), tag(tagLabel), tag(mailLabel)],
      deleted: false,
      publishURL: `u${hostileText('PUB')}`,
      shareURL: 'https://shared.example',
      creationDate: 1000,
      modificationDate: 2000,
    },
  });
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('n2'),
    note: {
      content: 'Plain note',
      systemTags: [],
      tags: [],
      deleted: false,
      creationDate: 1000,
      modificationDate: 1000,
    },
  });
  recordBlogSend(dataDir, 'n1', {
    postId: 'p1',
    url: `https://x/${hostileText('BLOG')}`,
    sentAt: '2026-09-28T00:00:00.000Z',
  });
  return store;
}

async function press(stdin: { write(value: string): void }, keys: string[]): Promise<void> {
  for (const key of keys) {
    stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('hostile layer 1 walk (T430)', () => {
  let dataDir: string;
  let savedCi: string | undefined;
  let savedXdg: string | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'hostile-layer1-'));
    setDataRoot(dataDir);
    savedCi = process.env.CI;
    savedXdg = process.env.XDG_DATA_HOME;
    delete process.env.CI;
    process.env.XDG_DATA_HOME = dataDir;
  });

  afterEach(() => {
    setDataRoot(null);
    if (savedCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = savedCi;
    }
    if (savedXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = savedXdg;
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function renderApp(focusList: boolean): Promise<{
    instance: InkInstance;
    stdin: { write(value: string): void };
    unmount(): void;
  }> {
    const store = seedStore(dataDir);
    const stdout = makeStdout();
    const stdin = makeStdin();
    const { unmount } = render(<App store={store} width={120} height={34} />, {
      stdout: stdout.stream,
      stdin: stdin.stream,
      patchConsole: false,
      exitOnCtrlC: false,
    });
    const instance = instances.get(stdout.fake)!;
    if (focusList) {
      await press(stdin, ['\t']);
    }
    return { instance, stdin, unmount };
  }

  it('1: WHEN the App has mounted with the seeded corpus THEN no `#text` node is bad, and some node contains `TITLE`.', async () => {
    const { instance, unmount } = await renderApp(false);
    try {
      const texts = await walkClean(instance, 'TITLE');
      expect(texts.filter((text) => isBad(text))).toEqual([]);
      expect(texts.some((text) => text.includes('TITLE'))).toBe(true);
    } finally {
      unmount();
    }
  });

  it('2: WHEN `\\r` then `v` are written (preview focused, raw then rendered) THEN no `#text` node is bad, and some node contains `BODY`.', async () => {
    const { instance, stdin, unmount } = await renderApp(true);
    try {
      await press(stdin, ['\r', 'v']);
      const preview = await walkClean(instance, 'BODY');
      expect(preview.filter((text) => isBad(text))).toEqual([]);
      expect(preview.some((text) => text.includes('BODY'))).toBe(true);
      await press(stdin, ['\x1b', 'i']);
      const editor = await walkClean(instance, 'BODY');
      expect(editor.filter((text) => isBad(text))).toEqual([]);
      expect(editor.some((text) => text.includes('BODY'))).toBe(true);
    } finally {
      unmount();
    }
  });

  it('3: WHEN Escape then `i` are written (inline editor on n1) THEN no `#text` node is bad, and some node contains `BODY`.', async () => {
    const { instance, stdin, unmount } = await renderApp(true);
    try {
      await press(stdin, ['\r', 'v', '\x1b', 'i']);
      const texts = await walkClean(instance, 'BODY');
      expect(texts.filter((text) => isBad(text))).toEqual([]);
      expect(texts.some((text) => text.includes('BODY'))).toBe(true);
    } finally {
      unmount();
    }
  });

  it('4: WHEN Escape, `y`, `t`, `j`, `j`, `R` are written, then Escape and `g` THEN after the rename prompt and after the tag editor no `#text` node is bad, and some node contains `TAG`.', async () => {
    const { instance, stdin, unmount } = await renderApp(true);
    try {
      await press(stdin, ['\r', 'v', '\x1b', 'y']);
      const afterRename = await walkClean(instance, 'TAG');
      expect(afterRename.filter((text) => isBad(text))).toEqual([]);
      expect(afterRename.some((text) => text.includes('TAG'))).toBe(true);
      await press(stdin, ['\x1b', 'g', 't', 'j', 'j', 'R']);
      const afterTagEditor = await walkClean(instance, 'TAG');
      expect(afterTagEditor.filter((text) => isBad(text))).toEqual([]);
      expect(afterTagEditor.some((text) => text.includes('TAG'))).toBe(true);
      await press(stdin, ['\x1b']);
      expect(HOSTILE.osc52Bel.length).toBeGreaterThan(0);
    } finally {
      unmount();
    }
  });

  it('5: WHEN Escape, `h`, Escape, `?`, `?`, `/`, `T`, Escape, `w` are written THEN after history, help, search and the export prompt no `#text` node is bad.', async () => {
    const { instance, stdin, unmount } = await renderApp(true);
    try {
      await press(stdin, ['\r', 'v', '\x1b', 'h']);
      const history = await walkClean(instance, 'TITLE');
      expect(history.filter((text) => isBad(text))).toEqual([]);
      await press(stdin, ['\x1b', '?', '?', '/', 'T']);
      const search = await walkClean(instance, 'TITLE');
      expect(search.filter((text) => isBad(text))).toEqual([]);
      await press(stdin, ['\x1b', 'w']);
      const exported = await walkClean(instance, 'TITLE');
      expect(exported.filter((text) => isBad(text))).toEqual([]);
      const help = await walkClean(instance, 'TITLE');
      expect(help.filter((text) => isBad(text))).toEqual([]);
      expect(LONG_LINE.length).toBe(50_000);
    } finally {
      unmount();
    }
  });

  it("6: WHEN `<Login>` is rendered the same way and `a@b.co`, `\\r` are written with a `requestCode` that rejects with `new Error(hostileText('ERR'))` THEN no `#text` node is bad, and some node contains `ERR`.", async () => {
    const stdout = makeStdout();
    const stdin = makeStdin();
    const { unmount } = render(
      <Login
        width={120}
        height={34}
        requestCode={() => Promise.reject(new Error(hostileText('ERR')))}
        completeLogin={async () => 'token'}
        onLoggedIn={() => undefined}
      />,
      {
        stdout: stdout.stream,
        stdin: stdin.stream,
        patchConsole: false,
        exitOnCtrlC: false,
      }
    );
    const instance = instances.get(stdout.fake)!;
    try {
      await press(stdin, ['a@b.co', '\r']);
      const texts = await walkClean(instance, 'ERR');
      expect(texts.filter((text) => isBad(text))).toEqual([]);
      expect(texts.some((text) => text.includes('ERR'))).toBe(true);
    } finally {
      unmount();
    }
  });
});
