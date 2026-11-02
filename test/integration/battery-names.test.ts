/**
 * Restart battery names (#92): a scenario is named by what it does, the rig
 * and the test files that run its rows agree on every name, and no row is
 * dropped. The test files are every file under test/ that imports the rig.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scenarioIds } from './restart-battery-rig';

const TEST_ROOT = join(__dirname, '..');
const SELF = 'battery-names.test.ts';
const ID = /\b[TF][0-9]{3}[A-Z]?\b|\bSR[0-9]+\b|\bS[0-9]{1,2}-[0-9]{2}\b/;

const source = (file: string): string => readFileSync(join(TEST_ROOT, file), 'utf8');
const consumerFiles = (): string[] =>
  readdirSync(TEST_ROOT, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.test\.tsx?$/.test(f) && !f.endsWith(SELF))
    .filter((f) => source(f).includes('restart-battery-rig'));
const quoted = (text: string): string[] => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
// A name a file runs: runScenario('x'), or an entry of its KEPT / NEVER_LOST list or its `of [...]` loop.
const namesIn = (file: string): string[] => {
  const text = source(file).replace(/^\s*\/\/.*$/gm, '');
  const called = [...text.matchAll(/runScenario\('([^']+)'\)/g)].map((m) => m[1]);
  const listed = [...text.matchAll(/(?:const (?:KEPT|NEVER_LOST) = |of )\[([^\]]*)\]/g)].flatMap((m) => quoted(m[1]));
  return [...called, ...listed];
};

describe('restart battery names', () => {
  it('1: WHEN the rig lists its scenario names THEN none carries an internal id (a task, finding or review id)', () => {
    const named = scenarioIds().filter((id) => ID.test(id));
    expect(named).toEqual([]);
  });

  it('2: WHEN the names the test files run are compared with the rig THEN the two sets are equal', () => {
    const used = new Set(consumerFiles().flatMap(namesIn));
    // Rows kept in the rig that no test runs yet (none now: sync-8 runs the prompt-start delete-moved rows); a row leaves this list when a test runs it.
    const NOT_RUN_YET: string[] = [];
    expect(NOT_RUN_YET.filter((id) => used.has(id))).toEqual([]);
    expect([...used, ...NOT_RUN_YET].sort()).toEqual([...new Set(scenarioIds())].sort());
  });

  it('3: WHEN the rig lists its scenario names THEN they are all different and at least `62` rows exist', () => {
    const ids = scenarioIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(62);
  });

  it('4: WHEN the kept and doubled files are read THEN the KEPT list holds at least `47` rows and the never-lost list at least `3`, and no row carries an internal id (joined over the five kept files)', () => {
    const keptFiles = [
      'integration/restart-battery-kept.test.ts',
      'integration/restart-battery-kept-2.test.ts',
      'integration/restart-battery-kept-3.test.ts',
      'integration/restart-battery-kept-4.test.ts',
      'integration/restart-battery-kept-5.test.ts',
    ];
    const keptRows = keptFiles.flatMap((f) =>
      quoted(/const KEPT = \[([^\]]*)\]/.exec(source(f).replace(/^\s*\/\/.*$/gm, ''))![1]),
    );
    const doubled = source('integration/restart-battery-doubled.test.ts').replace(/^\s*\/\/.*$/gm, '');
    const lostRows = quoted(/const NEVER_LOST = \[([^\]]*)\]/.exec(doubled)![1]);
    expect(keptRows.length).toBeGreaterThanOrEqual(47);
    expect(lostRows.length).toBeGreaterThanOrEqual(3);
    expect([...keptRows, ...lostRows].filter((id) => ID.test(id))).toEqual([]);
  });
});
