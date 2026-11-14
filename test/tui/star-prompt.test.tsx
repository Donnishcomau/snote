import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { clearProblem, publishProblem } from '../../src/core/problem-signal';
import { allowUpdateOffer, handOffRequested, resetUpdateOffer } from '../../src/core/update-offer';
import { publishBanner, resetBanner } from '../../src/core/update-banner';
import {
  PROMPT_NO_GH,
  PROMPT_WITH_GH,
  armStar,
  attachStarUi,
  openLineForTest,
  resetStarPrompt,
  setForcedGh,
  setPageOpener,
  setStarBoot,
  setStarNow,
  setStarRun,
  starConsent,
  starPromptPath,
  starShows,
  tryOpen,
} from '../../src/core/star-prompt';
import { bindStarRuntime, openUpdateAskFromBar, pokeStar, resetUpdateAskSeen, updateAskOpen, updateAskSeen } from '../../src/tui/update-ask';
import { App } from '../../src/tui/App';
import { getKeyLog, resetKeyLog } from '../../src/tui/app-keys';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const DAY = 86400000;
let t = 5_000_000;
let dir = '';
let mounted: { unmount: () => void } | null = null;
let delayAuth = false;
let holdApi = false;
let release: ((code: number) => void) | null = null;
const calls: string[] = [];
attachStarUi({ poke: pokeStar, askOpen: updateAskOpen, askSeen: updateAskSeen, bind: bindStarRuntime, handed: () => handOffRequested() !== null });

function storeWithNotes(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  for (const [id, content, mod, pinned, tags] of [
    ['a', 'Alpha\nbody', 2, true, []],
    ['b', 'Beta\nbody', 1, false, []],
  ] as const) {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: id,
      note: { content, systemTags: pinned ? ['pinned'] : [], tags: [...tags], deleted: false, modificationDate: mod, creationDate: 1 },
    } as never);
  }
  return store;
}
function writeEligible(folder: string): void {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(starPromptPath(folder), JSON.stringify({ launches: 8, firstLaunch: t - 8 * DAY, asked: false }));
}
function installRun(): void {
  calls.length = 0;
  delayAuth = false;
  holdApi = false;
  release = null;
  setStarRun((_file, args) => {
    const kind = args[0] === 'auth' || args[0] === 'api' ? args[0] : 'page';
    calls.push(kind);
    if ((kind === 'auth' && delayAuth) || (kind === 'api' && holdApi)) return new Promise<number>((r) => { release = r; });
    return Promise.resolve(0);
  });
}
function boot(folder: string): void {
  writeEligible(folder);
  t = 5_000_000;
  setStarNow(() => t);
  setStarBoot(t - 120_000);
  setForcedGh('/usr/bin/gh');
  installRun();
}
async function shown(ui: { stdin: { write: (s: string) => void; listenerCount: (e: string) => number }; lastFrame: () => string | undefined }): Promise<void> {
  await waitForInput(ui.stdin);
  await waitForFrame(ui.lastFrame, '>Alpha');
}

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  resetStarPrompt();
  resetUpdateAskSeen();
  resetUpdateOffer();
  resetBanner();
  clearProblem();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('star prompt line', () => {
  it('7a: WHEN the line is open THEN s, n and Escape answer it and j and k do not; a list key during gh auth status leaves the note; guards, consent and paste hold', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-ui-'));
    boot(dir);
    const ui = render(React.createElement(App, { store: storeWithNotes(), width: 80, height: 24 }));
    mounted = ui;
    await shown(ui);
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    expect(starShows()).toBe(PROMPT_WITH_GH);
    resetKeyLog();
    ui.stdin.write('j');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBe(1);
      expect(ui.lastFrame() ?? '').toContain('>Alpha');
      expect(ui.lastFrame() ?? '').not.toContain('>Beta');
    });
    resetKeyLog();
    ui.stdin.write('s');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBe(1);
      expect(calls.includes('auth')).toBe(false);
      expect(ui.lastFrame() ?? '').not.toContain('[y/N]');
    });
    t += 1000;
    ui.stdin.write('j');
    await waitForFrame(ui.lastFrame, '>Beta');
    ui.stdin.write('k');
    await waitForFrame(ui.lastFrame, '>Alpha');
    delayAuth = true;
    ui.stdin.write('s');
    await vi.waitFor(() => expect(calls.includes('auth')).toBe(true));
    const during = calls.length;
    resetKeyLog();
    ui.stdin.write('j');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBe(1);
      expect(calls.length).toBe(during);
    });
    release?.(0);
    release = null;
    delayAuth = false;
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(frame.includes('[y/N]') && frame.includes('>Alpha') && !frame.includes('>Beta')).toBe(true);
      expect(calls.length).toBe(during);
      expect(starConsent()).toBe(true);
    });
    resetKeyLog();
    ui.stdin.write('y');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBe(1);
      expect(calls.includes('api')).toBe(false);
      expect(ui.lastFrame() ?? '').toContain('[y/N]');
    });
    t += 1000;
    ui.stdin.write('x');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('No problem');
      expect(calls.includes('api')).toBe(false);
    });
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('s');
    await waitForFrame(ui.lastFrame, '[y/N]');
    t += 1000;
    const apis = calls.filter((c) => c === 'api').length;
    ui.stdin.write('sy');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('[y/N]');
      expect(calls.filter((c) => c === 'api').length).toBe(apis);
    });
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('s');
    await waitForFrame(ui.lastFrame, '[y/N]');
    t += 1000;
    ui.stdin.write('yy');
    await vi.waitFor(() => {
      expect(calls.filter((c) => c === 'api').length).toBe(apis);
      expect(ui.lastFrame() ?? '').toContain('[y/N]');
      expect(starConsent()).toBe(true);
    });
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('n');
    await vi.waitFor(() => {
      expect(starShows()).toBe('');
      expect(ui.lastFrame() ?? '').toContain('No problem');
    });
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('\x1b');
    await vi.waitFor(() => expect(starShows()).toBe(''));
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('s');
    await waitForFrame(ui.lastFrame, '[y/N]');
    t += 1000;
    ui.stdin.write('y');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('Thank you');
      expect(calls.filter((c) => c === 'api').length).toBe(apis + 1);
    });
  });

  it('7b: WHEN a search, an editor, a dialog or a prompt is active THEN the line stays shut, and UpdateAsk blocks both ways', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-ui-'));
    boot(dir);
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const ui = render(React.createElement(App, { store: storeWithNotes(), width: 80, height: 24, onLogout: () => {} }));
    mounted = ui;
    await shown(ui);
    ui.stdin.write('U');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('(y/n)');
      expect(updateAskOpen()).toBe(true);
      const opened = tryOpen(dir, { now: t, startedAt: t - 120_000, quietAt: null, busy: false, off: false, syncError: false, conflict: false, unsent: false });
      expect(opened).toBe(false);
      expect(starShows()).toBe('');
    });
    armStar(dir);
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(frame.includes('(y/n)') && !frame.includes('Enjoying snote')).toBe(true);
      expect(starShows()).toBe('');
    });
    ui.stdin.write('n');
    await waitForFrame(ui.lastFrame, (f) => !f.includes('(y/n)'));
    resetUpdateAskSeen();
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    resetKeyLog();
    ui.stdin.write('U');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBeGreaterThan(0);
      expect(updateAskOpen()).toBe(false);
      expect(ui.lastFrame() ?? '').not.toContain('(y/n)');
      expect(ui.lastFrame() ?? '').toContain('Enjoying snote');
    });
    ui.stdin.write('/');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('search: ');
      expect(starShows()).toBe('');
    });
    openLineForTest(true);
    await vi.waitFor(() => expect(starShows()).toBe(''));
    ui.stdin.write('\x1b');
    await waitForFrame(ui.lastFrame, (f) => !f.includes('search: '));
    t += 31_000;
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('i');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('Esc close');
      expect(starShows()).toBe('');
    });
    openLineForTest(true);
    await vi.waitFor(() => expect(starShows()).toBe(''));
    ui.stdin.write('\x1b');
    await waitForFrame(ui.lastFrame, (f) => !f.includes('Esc close'));
    t += 31_000;
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('L');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('log out');
      expect(starShows()).toBe('');
    });
    openLineForTest(true);
    await vi.waitFor(() => expect(starShows()).toBe(''));
  });

  it('7c: WHEN an unsent, conflict or sync notice shows THEN the line stays shut, and a notice mid-ask hides the line and the result', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-ui-'));
    boot(dir);
    const ui = render(React.createElement(App, { store: storeWithNotes(), width: 80, height: 24 }));
    mounted = ui;
    await shown(ui);
    publishProblem('1 change not sent yet');
    await waitForFrame(ui.lastFrame, 'not sent yet');
    const framesBeforeArm = ui.frames.length;
    armStar(dir);
    let polls = 0;
    await vi.waitFor(() => {
      polls += 1;
      // The frame can land before noteFromApp; a later poll is after that effect.
      expect(polls).toBeGreaterThan(1);
      expect(ui.frames.length).toBeGreaterThan(framesBeforeArm);
      expect(ui.frames.slice(framesBeforeArm).some((frame) => frame.includes('Enjoying snote'))).toBe(false);
      expect(ui.lastFrame() ?? '').toContain('not sent yet');
      expect(starShows()).toBe('');
      expect(JSON.parse(fs.readFileSync(starPromptPath(dir), 'utf8')).asked).toBe(false);
    });
    publishProblem('kept both versions of the note');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('kept both versions');
      expect(starShows()).toBe('');
    });
    publishProblem('sync connection went quiet');
    await vi.waitFor(() => {
      expect(ui.lastFrame() ?? '').toContain('sync connection');
      expect(starShows()).toBe('');
    });
    ui.stdin.write('j');
    await vi.waitFor(() => expect(starShows()).toContain('Enjoying snote'));
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    publishProblem('kept both versions of the note');
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(frame).toContain('kept both versions');
      expect(frame).not.toContain('Enjoying snote');
      expect(starShows()).toBe('');
    });
    ui.stdin.write('j');
    let clearPolls = 0;
    await vi.waitFor(() => {
      clearPolls += 1;
      expect(clearPolls).toBeGreaterThan(1);
      const frame = ui.lastFrame() ?? '';
      expect(frame).not.toContain('kept both versions');
      expect(starShows()).toBe('');
    });
    openLineForTest(true);
    t += 1000;
    let promptPolls = 0;
    await vi.waitFor(() => {
      promptPolls += 1;
      expect(promptPolls).toBeGreaterThan(1);
      const frame = ui.lastFrame() ?? '';
      expect(frame).toContain(PROMPT_WITH_GH);
      expect(frame).not.toContain('kept both versions');
      expect(starShows()).toBe(PROMPT_WITH_GH);
    });
    holdApi = true;
    ui.stdin.write('s');
    await waitForFrame(ui.lastFrame, '[y/N]');
    t += 1000;
    ui.stdin.write('y');
    await vi.waitFor(() => expect(calls.includes('api')).toBe(true));
    publishProblem('kept both versions of the note');
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(frame).toContain('kept both versions');
      expect(frame).not.toContain('[y/N]');
      expect(frame).not.toContain('Thank you');
    });
    release?.(0);
    release = null;
    holdApi = false;
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(frame).toContain('kept both versions');
      expect(frame).not.toContain('Thank you');
      expect(frame).not.toContain('No problem');
    });
    t += 1000;
    const prevEditor = process.env.SNOTE_NEW_NOTE_EDITOR;
    process.env.SNOTE_NEW_NOTE_EDITOR = 'inline';
    ui.stdin.write('n');
    try {
      await waitForFrame(ui.lastFrame, (f) => f.includes('Esc close') && !f.includes('No problem') && !f.includes('Thank you'));
    } finally {
      if (prevEditor === undefined) delete process.env.SNOTE_NEW_NOTE_EDITOR;
      else process.env.SNOTE_NEW_NOTE_EDITOR = prevEditor;
    }
    ui.stdin.write('\x1b');
    await waitForFrame(ui.lastFrame, (f) => !f.includes('Esc close'));
    setForcedGh(null);
    setPageOpener('/usr/bin/xdg-open');
    let pageRelease: ((code: number) => void) | null = null;
    setStarRun((_file, args) => new Promise<number>((resolve) => {
      calls.push(args[0] ?? '');
      pageRelease = resolve;
    }));
    openLineForTest(false);
    t += 1000;
    let pagePolls = 0;
    await vi.waitFor(() => {
      pagePolls += 1;
      expect(pagePolls).toBeGreaterThan(1);
      const frame = ui.lastFrame() ?? '';
      expect(frame).toContain(PROMPT_NO_GH);
      expect(frame).not.toContain('not sent yet');
      expect(frame).not.toContain('kept both versions');
      expect(frame).not.toContain('sync connection');
    });
    ui.stdin.write('s');
    await vi.waitFor(() => {
      expect(calls).toContain('https://github.com/Donnishcomau/snote');
    });
    publishProblem('1 change not sent yet');
    await waitForFrame(ui.lastFrame, (f) => f.includes('not sent yet') && !f.includes('Enjoying snote'));
    const framesBeforeRelease = ui.frames.length;
    const releasePage = pageRelease;
    pageRelease = null;
    releasePage?.(0);
    let releasePolls = 0;
    await vi.waitFor(() => {
      releasePolls += 1;
      expect(releasePolls).toBeGreaterThan(1);
      expect(ui.frames.length).toBeGreaterThan(framesBeforeRelease);
      const frame = ui.lastFrame() ?? '';
      expect(frame).toContain('not sent yet');
      expect(frame).not.toContain('Opened the snote page');
      expect(frame).not.toContain('Thank you');
    });
  });

  it('7d: WHEN gh auth status or the star call is held THEN the line is empty and a key starts nothing', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-ui-'));
    boot(dir);
    const ui = render(React.createElement(App, { store: storeWithNotes(), width: 80, height: 24 }));
    mounted = ui;
    await shown(ui);
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    ui.stdin.write('j');
    await waitForFrame(ui.lastFrame, '>Beta');
    ui.stdin.write('k');
    await waitForFrame(ui.lastFrame, '>Alpha');
    delayAuth = true;
    ui.stdin.write('s');
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(!frame.includes('Enjoying snote') && !frame.includes('[y/N]') && frame.includes('>Alpha')).toBe(true);
      expect(calls.includes('auth')).toBe(true);
    });
    const during = calls.length;
    resetKeyLog();
    ui.stdin.write('j');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBe(1);
      expect(calls.length).toBe(during);
      expect(ui.lastFrame() ?? '').toContain('>Alpha');
      expect(ui.lastFrame() ?? '').not.toContain('>Beta');
    });
    release?.(0);
    release = null;
    delayAuth = false;
    await waitForFrame(ui.lastFrame, (f) => f.includes('[y/N]') && f.includes('>Alpha') && !f.includes('>Beta'));
    t += 1000;
    holdApi = true;
    ui.stdin.write('y');
    await vi.waitFor(() => {
      const frame = ui.lastFrame() ?? '';
      expect(!frame.includes('[y/N]') && !frame.includes('Thank you')).toBe(true);
      expect(calls.filter((c) => c === 'api')).toHaveLength(1);
    });
    resetKeyLog();
    ui.stdin.write('n');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBe(1);
      expect(ui.lastFrame() ?? '').not.toContain('No problem');
      expect(calls.filter((c) => c === 'api')).toHaveLength(1);
      expect(calls.includes('page')).toBe(false);
    });
    release?.(0);
    release = null;
    await waitForFrame(ui.lastFrame, 'Thank you');
  });

  it('7e: WHEN a bar update click arrives while the star line is open THEN UpdateAsk stays shut and the click is not replayed when the line closes', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-ui-'));
    boot(dir);
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const ui = render(React.createElement(App, { store: storeWithNotes(), width: 80, height: 24, onLogout: () => {} }));
    mounted = ui;
    await shown(ui);
    openLineForTest(true);
    await waitForFrame(ui.lastFrame, 'Enjoying snote');
    t += 1000;
    openUpdateAskFromBar();
    resetKeyLog();
    ui.stdin.write('j');
    await vi.waitFor(() => {
      expect(getKeyLog().length).toBeGreaterThan(0);
      expect(updateAskOpen()).toBe(false);
      expect(ui.lastFrame() ?? '').not.toContain('(y/n)');
      expect(ui.lastFrame() ?? '').toContain('Enjoying snote');
    });
    ui.stdin.write('n');
    await vi.waitFor(() => {
      expect(starShows()).toBe('');
      expect(updateAskOpen()).toBe(false);
      expect(ui.lastFrame() ?? '').toContain('No problem');
      expect(ui.lastFrame() ?? '').not.toContain('(y/n)');
      expect(ui.lastFrame() ?? '').toContain('press U to update');
    });
    openUpdateAskFromBar();
    await waitForFrame(ui.lastFrame, '(y/n)');
  });
});
