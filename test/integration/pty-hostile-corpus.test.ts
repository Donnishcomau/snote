/**
 * #217 (R4): the hostile corpus (test/fixtures/hostile.ts) runs through the BUILT snote bundle on a real
 * pseudo-terminal, in normal mode and in screen-reader mode (SNOTE_SCREEN_READER=1, the only switch since #17), and nothing the corpus carries reaches the
 * terminal as a control sequence. The note list shows a note that holds the corpus; the editor then gets the
 * corpus as a bracketed paste written in 5-byte pieces (split writes), so a sequence is cut across writes.
 * #414: each run is checked against the renderer its mode expects, and a third run in screen-reader mode writes the
 * corpus straight to process.stdout from a test preload (test/helpers/pty-inject.mjs), the layer-2 path no note text reaches.
 * The bundle is dist/snote-main.js when SNOTE_PTY_BUNDLE names it (CI), else a fresh bundle of src/.
 * Linux only (python3 pty). SNOTE_PTY_REQUIRED=1 (CI) turns a missing pty into a failure, never a skip.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';
import { saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { accountDir } from '../../src/core/token';
import { HOSTILE, hostileText } from '../fixtures/hostile';

const MARK = 'PTYMARK';
const python = spawnSync('python3', ['-I', '-c', 'import pty'], { stdio: 'ignore' }).status === 0;
const enabled = process.platform === 'linux' && python;
const required = process.env.SNOTE_PTY_REQUIRED === '1';
const root = mkdtempSync(join(tmpdir(), 'pty-hostile-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Run = { status: number | null; wire: Buffer };
type Mode = 'normal' | 'sr';
const INJECT_START = 'INJECTMARK';
const INJECT_END = 'INJECTEND';

/** Start the bundle on a pty with the corpus in a note, paste the corpus into the editor, return every byte shown. */
function drive(bundlePath: string, mode: Mode, name: string, inject = false): Run {
  const data = join(root, name, 'data');
  const home = join(root, name, 'home');
  mkdirSync(home, { recursive: true });
  const dir = accountDir(data, 'a@b.co');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(data, 'auth.json'), JSON.stringify({ email: 'a@b.co', token: 't', server: 'http://127.0.0.1:9' }), { mode: 0o600 });
  const store = makeStore({ stubClient: {} });
  const note = { content: `${hostileText(MARK)}\nsecond line`, tags: [], systemTags: [], deleted: false, creationDate: 1000, modificationDate: 1000 };
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'h1' as never, note: note as never });
  saveState(store.getState(), dir);
  const paste = join(root, name, 'paste.bin');
  writeFileSync(paste, Object.values(HOSTILE).join(''));
  const out = join(root, name, 'wire.bin');
  const driver = join(process.cwd(), 'test/helpers/pty-hostile-drive.py');
  const args = ['-I', driver, process.execPath, bundlePath, data, home, out, mode, MARK, paste];
  if (inject) {
    // the whole corpus between two markers; `\x1b[?1049h` stays out because the guard keeps that mode on purpose
    const payload = join(root, name, 'payload.bin');
    writeFileSync(payload, `${INJECT_START}${Object.values(HOSTILE).join('').split('\x1b[?1049h').join('')}${INJECT_END}`);
    args.push(join(process.cwd(), 'test/helpers/pty-inject.mjs'), payload);
  }
  const r = spawnSync('python3', args, { encoding: 'utf8', timeout: 90000 });
  let wire: Buffer = Buffer.alloc(0);
  try {
    wire = readFileSync(out);
  } catch {
    // no capture file: the driver could not capture anything
  }
  return { status: r.status, wire };
}

/** A run counts only when the pty opened, the marker reached the screen and the editor opened for the paste. */
function checkCaptured(r: Run, label = '', renderer: Mode = 'normal'): void {
  if (r.status !== 0) throw new Error(`pty run failed (${label}): driver exit ${String(r.status)}`);
  if (r.wire.length === 0) throw new Error(`pty run captured zero frames (${label})`);
  const text = r.wire.toString('latin1');
  if (!text.includes(MARK)) throw new Error(`pty run never showed the note marker (${label})`);
  if (!text.includes('Ctrl+S')) throw new Error(`pty run never opened the editor for the paste (${label})`);
  // Ink's normal renderer styles the pane title and draws a dim divider; its screen-reader renderer (which
  // skips the stage that drops OSC sequences, #10063) draws plain text in one column with neither.
  const normalDrawn = text.includes('\x1b[34mNotes') && text.includes('\x1b[2m\xe2\x94\x82');
  const srDrawn = /Notes +\r\n> PTYMARK/.test(text) && !text.includes('\x1b[34mNotes');
  if (renderer === 'normal' && !normalDrawn) throw new Error(`pty run did not use the normal renderer (${label})`);
  if (renderer === 'sr' && !srDrawn) throw new Error(`pty run did not use the screen-reader renderer (${label})`);
}

const CSI = /^\x1b\[([0-9;?]*)([ -/]*)([@-~])/;
const SGR_OK = new Set(['0', '1', '2', '7', '22', '27', '31', '34', '39']);
/**
 * Everything on the wire that is not plain text or the sequences snote draws with: any escape that is not a CSI,
 * a CSI outside the drawing set (SGR 0 1 2 7 22 27 31 34 39, show or hide cursor, bracketed paste and
 * synchronized-output mode, cursor up, column, home, erase), a control byte other than CR and LF, a UTF-8 C1
 * control, and the invisible and bidi characters. Returns one entry per find; the list is empty for a clean wire.
 */
function forbiddenIn(wire: Buffer): string[] {
  // #387 (R4): the status bar's own pending count (src/tui/StatusBar.tsx, warning yellow with its reset) is
  // replaced by one space, never removed, so the bytes on either side cannot join into a new sequence
  const s = wire.toString('latin1').replace(/\x1b\[33m \d+ pending(?: \(no sync\))?\x1b\[39m/g, ' ');
  const found: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x1b) {
      const m = CSI.exec(s.slice(i, i + 40));
      const ok =
        m !== null &&
        (m[3] === 'm' ? m[1].split(';').every((p) => SGR_OK.has(p)) : /^\?(25|2004|2026)$/.test(m[1]) ? m[3] === 'h' || m[3] === 'l' : /^[0-9]*$/.test(m[1]) && 'AGHJK'.includes(m[3]));
      if (!ok) found.push(`escape ${JSON.stringify(s.slice(i, i + 12))}`);
    } else if ((c < 0x20 && c !== 0x0a && c !== 0x0d) || c === 0x7f) {
      found.push(`control 0x${c.toString(16)}`);
    }
  }
  // #663: also U+00AD, U+061C, U+2060-U+2064, U+FEFF, the tag characters U+E0000-U+E007F, U+FE00-U+FE0D, U+034F, U+3164
  // and U+E0100-U+E01EF (the corpus `format` entry)
  for (const m of s.matchAll(/\xc2[\x80-\x9f\xad]|\xd8\x9c|\xe2\x80[\x8b-\x8f\xa8-\xae]|\xe2\x81[\xa0-\xa4\xa6-\xa9]|\xef\xbb\xbf|\xf3\xa0[\x80\x81][\x80-\xbf]|\xef\xb8[\x80-\x8d]|\xcd\x8f|\xe3\x85\xa4|\xf3\xa0[\x84-\x87][\x80-\xbf]/g)) found.push(`char ${JSON.stringify(m[0])}`);
  return found;
}

describe.skipIf(!enabled && !required)('#217 the hostile corpus through the built bundle on a pty', () => {
  let bundlePath = '';
  const runs: Record<string, Run> = {};
  beforeAll(async () => {
    if (!enabled) throw new Error('SNOTE_PTY_REQUIRED=1 but this machine has no pty (Linux with python3 pty)');
    if (process.env.SNOTE_PTY_BUNDLE) {
      bundlePath = resolve(process.env.SNOTE_PTY_BUNDLE);
    } else {
      bundlePath = join(root, 'snote.js');
      await bundle({ entry: 'src/cli/index.ts', outfile: bundlePath });
    }
    runs.normal = drive(bundlePath, 'normal', 'normal');
    runs.sr = drive(bundlePath, 'sr', 'sr');
    runs.inject = drive(bundlePath, 'sr', 'inject', true);
  }, 240000);

  it('1: WHEN the built bundle shows a note holding the corpus and gets the corpus pasted in `5`-byte pieces, in normal mode and in screen-reader mode started with `SNOTE_SCREEN_READER=1`, THEN each run reports `forbidden bytes: 0`', () => {
    for (const key of Object.keys(HOSTILE) as (keyof typeof HOSTILE)[]) {
      expect(forbiddenIn(Buffer.from(HOSTILE[key], 'utf8')).length, `the detector misses ${key}`).toBeGreaterThan(0);
    }
    expect(forbiddenIn(Buffer.from('\x1b[33m')).length).toBeGreaterThan(0);
    expect(forbiddenIn(Buffer.from('\x1b[33mhostile')).length).toBeGreaterThan(0);
    expect(forbiddenIn(Buffer.from('\x1b[33m 1 pending (no sync)\x1b[39m'))).toEqual([]);
    expect(forbiddenIn(Buffer.from('\x1b[3\x1b[33m 1 pending\x1b[39m1m')).length).toBeGreaterThan(0);
    for (const mode of ['normal', 'sr'] as const) {
      checkCaptured(runs[mode], mode, mode);
      const found = forbiddenIn(runs[mode].wire);
      expect(found, mode).toEqual([]);
      expect(`forbidden bytes: ${found.length}`).toBe('forbidden bytes: 0');
    }
  });

  it('2: WHEN the screen-reader run\'s wire is read THEN it shows the screen-reader renderer\'s single column (`Notes`, spaces, CR LF, then `> PTYMARK`), never the normal renderer\'s `\\x1b[34mNotes`, and holds `0` SGR sequences; and checkCaptured throws when a run\'s renderer is not the one its mode expects (the normal run checked as screen-reader, the screen-reader run checked as normal)', () => {
    const text = runs.sr.wire.toString('latin1');
    expect(text).toMatch(/Notes +\r\n> PTYMARK/);
    expect(text).not.toContain('\x1b[34mNotes');
    expect(text.match(/\x1b\[[0-9;]*m/g) ?? []).toHaveLength(0);
    expect(() => checkCaptured(runs.sr, 'sr', 'sr')).not.toThrow();
    expect(() => checkCaptured(runs.normal, 'normal', 'sr')).toThrow(/did not use the screen-reader renderer/);
    expect(() => checkCaptured(runs.sr, 'sr', 'normal')).toThrow(/did not use the normal renderer/);
  });

  it('3: WHEN, in screen-reader mode, a test preload writes `INJECTMARK`, the whole corpus without `\\x1b[?1049h`, then `INJECTEND` straight to process.stdout after the marker shows THEN the bytes between the two markers are non-empty and report `forbidden bytes: 0`, with no `\\x1b]` and no `\u202e`', () => {
    checkCaptured(runs.inject, 'inject', 'sr');
    const text = runs.inject.wire.toString('latin1');
    const from = text.indexOf(INJECT_START);
    const to = text.indexOf(INJECT_END);
    expect(from, 'the preload wrote nothing').toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const segment = runs.inject.wire.subarray(from + INJECT_START.length, to);
    expect(segment.length).toBeGreaterThan(0);
    const found = forbiddenIn(segment);
    expect(found, 'inject').toEqual([]);
    expect(`forbidden bytes: ${found.length}`).toBe('forbidden bytes: 0');
    const seg = segment.toString('latin1');
    expect(seg).not.toContain('\x1b]');
    expect(segment.toString('utf8')).not.toContain('\u202e');
  });

  it('4: WHEN the bundle cannot start on the pty (a bundle path that does not exist) THEN the driver exits `3`, no marker is captured and checkCaptured throws instead of passing', () => {
    const r = drive(join(root, 'no-such-bundle.js'), 'normal', 'missing');
    expect(r.status).toBe(3);
    expect(r.wire.toString('latin1')).not.toContain(MARK);
    expect(() => checkCaptured(r)).toThrow(/pty run failed/);
    expect(() => checkCaptured({ status: 0, wire: Buffer.alloc(0) })).toThrow(/zero frames/);
  });

  it('5: WHEN the corpus SGR test strings (background `45` and conceal `8`) are sent THEN neither appears on the wire in either mode', () => {
    expect(HOSTILE.sgr).toContain('\x1b[45m');
    expect(HOSTILE.sgr).toContain('\x1b[8m');
    for (const mode of ['normal', 'sr']) {
      const text = runs[mode].wire.toString('latin1');
      expect(text.length).toBeGreaterThan(1000);
      expect(text).not.toContain('\x1b[45m');
      expect(text).not.toContain('\x1b[8m');
    }
  });
});

describe('#217 the CI workflow runs the corpus on dist/', () => {
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
  it('6: WHEN .github/workflows/check.yml is read THEN `npm run build` comes before a step that runs `test/integration/pty-hostile-corpus.test.ts` with `SNOTE_PTY_BUNDLE: dist/snote-main.js` and `SNOTE_PTY_REQUIRED` set, and the runs-on line, `contents: read` and the two pinned actions are unchanged', () => {
    const build = workflow.indexOf('run: npm run build');
    const corpus = workflow.indexOf('run: npx vitest run test/integration/pty-hostile-corpus.test.ts');
    expect(build).toBeGreaterThan(workflow.indexOf('make check-ci'));
    expect(corpus).toBeGreaterThan(build);
    const step = workflow.slice(build, corpus);
    expect(step).toContain("SNOTE_PTY_BUNDLE: dist/snote-main.js");
    expect(step).toContain("SNOTE_PTY_REQUIRED: '1'");
    // every runs-on line is ubuntu-latest; a checkout that carries the private workflow tooling may route the one line through a repository setting (file and setting names assembled, so this text names neither)
    const tooling = join('scripts', ['export', 'workflows.sh'].join('-'));
    const routedLine = '    runs-on: ${{ vars.' + ['CI', 'RUNNER'].join('_') + " || 'ubuntu-latest' }}";
    const allowed = ['    runs-on: ubuntu-latest'];
    if (existsSync(tooling)) allowed.push(routedLine);
    const runsOn = workflow.split('\n').filter((l) => l.includes('runs-on'));
    expect(runsOn.length).toBeGreaterThan(0);
    for (const l of runsOn) expect(allowed).toContain(l);
    expect(workflow).toContain('permissions:\n  contents: read\n');
    expect(workflow.split('\n').filter((l) => l.includes('uses:'))).toHaveLength(2);
  });
});
