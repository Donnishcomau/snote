import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createSentChanges,
  loadSentChanges,
  type SentRecord,
} from '../../src/core/sent-changes';

const SENT_FILE = 'sent-changes.json';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sent-changes-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const readFile = (): SentRecord =>
  JSON.parse(readFileSync(join(dir, SENT_FILE), 'utf8')) as SentRecord;

const writeFileContents = (text: string): void => {
  writeFileSync(join(dir, SENT_FILE), text);
};

it('1: WHEN a tracker on an empty folder gets sent(n1,c1) and sent(n2,c2) THEN sent-changes.json parses to {"n1":"c1","n2":"c2"}, its mode is 0o600 and no sent-changes.json.tmp exists', () => {
  const tracker = createSentChanges(dir);
  tracker.sent('n1', 'c1');
  tracker.sent('n2', 'c2');
  expect(readFile()).toEqual({ n1: 'c1', n2: 'c2' });
  expect(statSync(join(dir, SENT_FILE)).mode & 0o777).toBe(0o600);
  expect(existsSync(join(dir, `${SENT_FILE}.tmp`))).toBe(false);
});

it('2: WHEN line 1s tracker then gets acknowledged(n1,c9) and then acknowledged(n1,c1) THEN the file parses to {"n1":"c1","n2":"c2"} after the first call and to {"n2":"c2"} after the second', () => {
  const tracker = createSentChanges(dir);
  tracker.sent('n1', 'c1');
  tracker.sent('n2', 'c2');
  tracker.acknowledged('n1', 'c9');
  expect(readFile()).toEqual({ n1: 'c1', n2: 'c2' });
  tracker.acknowledged('n1', 'c1');
  expect(readFile()).toEqual({ n2: 'c2' });
});

it('3: WHEN the file holds {"n1":"c1","n2":7}, then n1-not-json, then ["n1"], then is missing THEN loadSentChanges returns {"n1":"c1"}, {}, {} and {} and createSentChanges does not throw for any of them', () => {
  writeFileContents('{"n1":"c1","n2":7}');
  expect(loadSentChanges(dir)).toEqual({ n1: 'c1' });
  expect(() => createSentChanges(dir)).not.toThrow();
  writeFileContents('n1-not-json');
  expect(loadSentChanges(dir)).toEqual({});
  expect(() => createSentChanges(dir)).not.toThrow();
  writeFileContents('["n1"]');
  expect(loadSentChanges(dir)).toEqual({});
  expect(() => createSentChanges(dir)).not.toThrow();
  rmSync(join(dir, SENT_FILE));
  expect(loadSentChanges(dir)).toEqual({});
  expect(() => createSentChanges(dir)).not.toThrow();
});

it('4: WHEN the file holds {"n1":"c1","n3":"c3"} and the tracker gets sent(n1,c5), sent(n2,c2), settle() THEN the file parses to {"n1":"c5","n2":"c2","n3":"c3"} before settle and {"n1":"c5","n2":"c2"} after', () => {
  writeFileContents('{"n1":"c1","n3":"c3"}');
  const tracker = createSentChanges(dir);
  tracker.sent('n1', 'c5');
  tracker.sent('n2', 'c2');
  expect(readFile()).toEqual({ n1: 'c5', n2: 'c2', n3: 'c3' });
  tracker.settle();
  expect(readFile()).toEqual({ n1: 'c5', n2: 'c2' });
});

it('5: WHEN the file holds {"n1":"c1","n2":"c2"} and echoes gets [{"id":"n1","ccids":["x","c1"]},{"id":"n2","ccids":["c9"]},{"id":"n3","ccids":["c1"]}] with inFlight {} THEN it returns exactly [{"id":"n1","ccid":"c1"}]', () => {
  writeFileContents('{"n1":"c1","n2":"c2"}');
  const tracker = createSentChanges(dir);
  const data =
    '[{"id":"n1","ccids":["x","c1"]},{"id":"n2","ccids":["c9"]},{"id":"n3","ccids":["c1"]}]';
  expect(tracker.echoes(data, {})).toEqual([{ id: 'n1', ccid: 'c1' }]);
});

it('6: WHEN the file holds {"n1":"c1"} THEN echoes of n1 with ccids ["c1"] is [{"id":"n1","ccid":"c1"}], but [] with n1 in inFlight, with an error field, for not-json, after settle(), and for a new sent(n1,c1)', () => {
  writeFileContents('{"n1":"c1"}');
  const data = '[{"id":"n1","ccids":["c1"]}]';
  const tracker = createSentChanges(dir);
  expect(tracker.echoes(data, {})).toEqual([{ id: 'n1', ccid: 'c1' }]);
  expect(tracker.echoes(data, { n1: true })).toEqual([]);
  expect(
    tracker.echoes('[{"id":"n1","ccids":["c1"],"error":"oops"}]', {})
  ).toEqual([]);
  expect(tracker.echoes('not-json', {})).toEqual([]);
  tracker.settle();
  expect(tracker.echoes(data, {})).toEqual([]);
  const fresh = createSentChanges(dir);
  fresh.sent('n1', 'c1');
  expect(fresh.echoes(data, {})).toEqual([]);
});

it('1: WHEN the file holds {"n1":"c1"} and the tracker gets sent(n1,c5) THEN echoes of n1 with ccids ["c1"], [""] and ["c5"] are all [], and a tracker on {"n1":""} after sent(n1,c2) echoes [] for [""], ["c1"] and ["c2"]', () => {
  writeFileContents('{"n1":"c1"}');
  const tracker = createSentChanges(dir);
  tracker.sent('n1', 'c5');
  expect(tracker.echoes('[{"id":"n1","ccids":["c1"]}]', {})).toEqual([]);
  expect(tracker.echoes('[{"id":"n1","ccids":[""]}]', {})).toEqual([]);
  expect(tracker.echoes('[{"id":"n1","ccids":["c5"]}]', {})).toEqual([]);
  writeFileContents('{"n1":""}');
  const stale = createSentChanges(dir);
  stale.sent('n1', 'c2');
  expect(stale.echoes('[{"id":"n1","ccids":[""]}]', {})).toEqual([]);
  expect(stale.echoes('[{"id":"n1","ccids":["c1"]}]', {})).toEqual([]);
  expect(stale.echoes('[{"id":"n1","ccids":["c2"]}]', {})).toEqual([]);
});
