/**
 * #553: a state.json that parses but has the wrong shape is unloadable
 * (loadState returns undefined), so start-up takes the #545 recovery path
 * (state.json.corrupt, pending notes kept) instead of dropping notes or crashing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { loadState, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame } from '../helpers/ink-waits';

const APP_ID = 'test-app';
let dir: string;
const servers: FakeSimperiumServer[] = [];
const open: Array<ReturnType<typeof buildStore>> = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snote-553-'));
});

afterEach(() => {
  for (const b of open.splice(0)) {
    b.stopSaving();
    (b.store.client as unknown as { end?: () => void })?.end?.();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) s.stop();
  rmSync(dir, { recursive: true, force: true });
});

const write = (text: string) => writeFileSync(join(dir, 'state.json'), text);
const map = (entries: unknown[] = []) => ({ __map: entries });
const note = (extra: object = {}) => ({ content: 'x', tags: [], systemTags: [], ...extra });
const notesOf = (s: ReturnType<typeof loadState>) => (s?.data as unknown as { notes: Map<string, unknown> } | undefined)?.notes;

describe('#553 loadState: a state.json of the wrong shape is unloadable', () => {
  it('1: WHEN state.json was written by saveState THEN loadState returns it with notes, tags, noteTags and preferences as Maps', () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: 'kept', systemTags: [], tags: [] } } as never);
    saveState(store.getState(), dir);
    const data = loadState(dir)?.data as unknown as Record<string, unknown>;
    expect((data.notes as Map<string, { content?: string }>).get('n1')?.content).toBe('kept');
    for (const key of ['tags', 'noteTags', 'preferences']) expect(data[key]).toBeInstanceOf(Map);
  });

  it('2: WHEN state.json holds only a notes Map (the other maps absent; one note has no tags or systemTags, as notes from other clients) THEN loadState returns it as before', () => {
    write(JSON.stringify({ version: 1, data: { notes: map([['n1', note()], ['n2', { content: 'bare' }]]) } }));
    expect(notesOf(loadState(dir))?.size).toBe(2);
  });

  it('3: WHEN state.json is `{"version":1,"data":{}}` (no notes) THEN loadState returns undefined', () => {
    write('{"version":1,"data":{}}');
    expect(loadState(dir)).toBeUndefined();
  });

  it('4: WHEN state.json has no `data` THEN loadState returns undefined', () => {
    write('{"version":1}');
    expect(loadState(dir)).toBeUndefined();
  });

  it('5: WHEN `data` is null, a string or an array THEN loadState returns undefined', () => {
    for (const data of ['null', '"text"', '[]']) {
      write(`{"version":1,"data":${data}}`);
      expect(loadState(dir), data).toBeUndefined();
    }
  });

  it('6: WHEN notes is a plain object, not an encoded Map THEN loadState returns undefined', () => {
    write(JSON.stringify({ version: 1, data: { notes: { n1: { content: 'x' } } } }));
    expect(loadState(dir)).toBeUndefined();
  });

  it('7: WHEN notes is an encoded Set, not a Map THEN loadState returns undefined', () => {
    write(JSON.stringify({ version: 1, data: { notes: { __set: ['n1'] } } }));
    expect(loadState(dir)).toBeUndefined();
  });

  it('8: WHEN notes is an encoded Map whose entries are not a list THEN loadState returns undefined, it does not throw', () => {
    write('{"version":1,"data":{"notes":{"__map":5}}}');
    expect(loadState(dir)).toBeUndefined();
  });

  it('9: WHEN the file is JSON null, a number or an array THEN loadState returns undefined, it does not throw', () => {
    for (const text of ['null', '5', '[]']) {
      write(text);
      expect(loadState(dir), text).toBeUndefined();
    }
  });

  it('10: WHEN notes is a Map but tags, noteTags or preferences is not a Map THEN loadState returns undefined', () => {
    for (const key of ['tags', 'noteTags', 'preferences']) {
      write(JSON.stringify({ version: 1, data: { notes: map(), [key]: { a: 1 } } }));
      expect(loadState(dir), key).toBeUndefined();
    }
  });

  it('14: WHEN a note value is a number, a string, a boolean, an array or an empty object THEN loadState returns undefined', () => {
    for (const value of [5, 'x', true, [], {}]) {
      write(JSON.stringify({ version: 1, data: { notes: map([['n1', value]]) } }));
      expect(loadState(dir), JSON.stringify(value)).toBeUndefined();
    }
  });

  it('15: WHEN a note has no string content, or a tags or systemTags array that holds a non-string THEN loadState returns undefined', () => {
    const bad = [{ tags: [], systemTags: [] }, note({ content: 5 }), note({ tags: [5] }), note({ systemTags: [5] }), note({ systemTags: ['pinned', null] })];
    for (const value of bad) {
      write(JSON.stringify({ version: 1, data: { notes: map([['n1', value]]) } }));
      expect(loadState(dir), JSON.stringify(value)).toBeUndefined();
    }
  });
});

describe('#553 buildStore: a wrong-shape state.json takes the #545 recovery path', () => {
  const n9 = { content: 'offline note', creationDate: 1, deleted: false, modificationDate: 5000, systemTags: [], tags: [] };

  async function startWith(stateText: string) {
    const server = new FakeSimperiumServer();
    await server.start();
    servers.push(server);
    write(stateText);
    writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n9 }));
    writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n9: 5000 }));
    const built = buildStore({ dataDir: dir, appId: APP_ID, server: server.url }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
    open.push(built);
    return built;
  }
  const noteN9 = (b: ReturnType<typeof buildStore>) => b.store.getState().data.notes.get('n9' as never) as { content?: string } | undefined;

  it('11: WHEN state.json is `{"version":1,"data":{}}` and n9 is pending THEN the store holds n9 as `offline note` as soon as buildStore returns and the file is kept as state.json.corrupt', async () => {
    const b = await startWith('{"version":1,"data":{}}');
    expect(noteN9(b)?.content).toBe('offline note');
    expect(readFileSync(join(dir, 'state.json.corrupt'), 'utf8')).toBe('{"version":1,"data":{}}');
  });

  it('12: WHEN state.json is `{"version":1}` and n9 is pending THEN buildStore does not throw and the store holds n9 as `offline note`', async () => {
    const b = await startWith('{"version":1}');
    expect(noteN9(b)?.content).toBe('offline note');
  });

  it('13: WHEN state.json holds n9 as null and n9 is pending THEN loadState returns undefined, buildStore does not throw and the store holds n9 as `offline note`', async () => {
    const text = '{"version":1,"data":{"notes":{"__map":[["n9",null]]}}}';
    write(text);
    expect(loadState(dir)).toBeUndefined();
    const b = await startWith(text);
    expect(noteN9(b)?.content).toBe('offline note');
  });

  it('16: WHEN state.json holds n1 as the number 5 and n9 is pending THEN buildStore does not throw and the screen lists `offline note`', async () => {
    const b = await startWith('{"version":1,"data":{"notes":{"__map":[["n1",5]]}}}');
    const r = render(createElement(App, { store: b.store, width: 80, height: 24 }));
    const frame = await waitForFrame(r.lastFrame, 'offline note');
    expect(frame).toContain('offline note');
    r.unmount();
  });

  it('17: WHEN state.json holds notes whose tags or systemTags are `{}`, null, a number or a string and n9 is pending THEN loadState returns a state, no state.json.corrupt is written, buildStore does not throw and the screen lists every one of those notes and `offline note`', async () => {
    const dated = (content: string, extra: object) => note({ content, creationDate: 1, modificationDate: 1000, deleted: false, ...extra });
    const text = JSON.stringify({
      version: 1,
      data: {
        notes: map([
          ['n1', dated('kept braces', { tags: {}, systemTags: {} })],
          ['n2', dated('kept text', { tags: 'x', systemTags: 5 })],
          ['n3', dated('kept null', { tags: null, systemTags: 'pinned' })],
          ['n4', dated('kept number', { tags: 5 })],
        ]),
      },
    });
    write(text);
    expect(loadState(dir)).toBeDefined();
    const b = await startWith(text);
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(false);
    const n1 = b.store.getState().data.notes.get('n1' as never) as { tags?: unknown; systemTags?: unknown };
    expect([n1.tags, n1.systemTags]).toEqual([[], []]);
    const r = render(createElement(App, { store: b.store, width: 80, height: 24 }));
    const frame = await waitForFrame(r.lastFrame, 'offline note');
    for (const c of ['kept braces', 'kept text', 'kept null', 'kept number']) expect(frame).toContain(c);
    r.unmount();
  });

  const withMaps = (extra: object) =>
    JSON.stringify({ version: 1, data: { notes: map([['n1', note({ content: 'kept', creationDate: 1, modificationDate: 1000, deleted: false })]]), ...extra } });
  const dataOf = () => loadState(dir)?.data as unknown as Record<string, Map<string, unknown>>;

  it('18: WHEN state.json holds a tags Map with a null value and n9 is pending THEN loadState returns a state without that entry, no state.json.corrupt is written, buildStore does not throw and the screen lists the kept note and `offline note`', async () => {
    const text = withMaps({ tags: map([['t', null], ['u', { name: 'ok' }]]) });
    write(text);
    expect([...dataOf().tags.keys()]).toEqual(['u']);
    const b = await startWith(text);
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(false);
    const r = render(createElement(App, { store: b.store, width: 80, height: 24 }));
    const frame = await waitForFrame(r.lastFrame, 'offline note');
    expect(frame).toContain('kept');
    r.unmount();
  });

  it('19: WHEN a tags value is null, a number, a string, an array, `{}` or has a name that is not a string THEN loadState drops that entry and keeps an entry with a string name unchanged', () => {
    write(withMaps({ tags: map([['a', null], ['b', 5], ['c', 'x'], ['d', []], ['e', {}], ['f', { name: 5 }], ['g', { name: 'ok', index: 0 }]]) }));
    expect([...dataOf().tags.entries()]).toEqual([['g', { name: 'ok', index: 0 }]]);
  });

  it('20: WHEN a noteTags value is null, an array, `{}` or a number THEN loadState drops that entry and keeps a Set, no state.json.corrupt is written, and an EDIT_NOTE with tags and an ADD_NOTE_TAG do not throw', async () => {
    const text = withMaps({ noteTags: map([['a', null], ['b', []], ['c', {}], ['d', 5], ['e', { __set: ['n1'] }]]) });
    write(text);
    expect([...dataOf().noteTags.keys()]).toEqual(['e']);
    const b = await startWith(text);
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(false);
    expect(() => b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { tags: ['a'] } } as never)).not.toThrow();
    expect(() => b.store.dispatch({ type: 'ADD_NOTE_TAG', noteId: 'n1', tagName: 'b' } as never)).not.toThrow();
  });

  it('21: WHEN state.json holds noteRevisions as a number THEN loadState returns a state without a noteRevisions key and a LOAD_REVISIONS does not throw', async () => {
    const text = withMaps({ noteRevisions: 5 });
    write(text);
    expect('noteRevisions' in dataOf()).toBe(false);
    const b = await startWith(text);
    expect(() => b.store.dispatch({ type: 'LOAD_REVISIONS', noteId: 'n1', revisions: [] } as never)).not.toThrow();
  });

  it('22: WHEN tags, noteTags and preferences hold well-formed entries and preferences values are null, a number or an object THEN loadState keeps every entry unchanged', () => {
    write(withMaps({ tags: map([['g', { name: 'ok', index: 0 }]]), noteTags: map([['g', { __set: ['n1'] }]]), preferences: map([['p', { analytics_enabled: true }], ['q', null], ['r', 5]]) }));
    const d = dataOf();
    expect([...d.tags.entries()]).toEqual([['g', { name: 'ok', index: 0 }]]);
    expect([...(d.noteTags.get('g') as Set<string>)]).toEqual(['n1']);
    expect([...d.preferences.entries()]).toEqual([['p', { analytics_enabled: true }], ['q', null], ['r', 5]]);
  });
});
