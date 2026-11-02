/**
 * #130 ( P6/P8). The start-up ghost restore runs before buildStore
 * returns, so no socket message can reach the sync library first: a catch-up
 * echo confirmed before the restore let the ghost's older copy replace the
 * confirmed edit in the store, and the next edit removed it on the server.
 * Both starts are covered by battery rows.
 */
import { afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildStore } from '../../src/cli/main';
import { cleanupBattery, runScenario } from '../integration/restart-battery-rig';

const dirs: string[] = [];
const stops: Array<() => void> = [];
afterEach(() => {
  for (const s of stops.splice(0)) s();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
afterEach(cleanupBattery);

const note = (content: string, modificationDate: number) => ({ content, creationDate: 1000, modificationDate, deleted: false, systemTags: [], tags: [] });

describe('#130: the start-up restore runs before any sync message', () => {
  it('1: WHEN state.json holds n1 `STATE` (date 1000), the ghost file holds n1 `GHOST` (date 2000) and buildStore runs against an unreachable server THEN, read right after buildStore returns, the store holds n1 with content `GHOST`', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-130-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ version: 1, data: { notes: { __map: [['n1', note('STATE', 1000)]] } } }));
    fs.writeFileSync(path.join(dir, 'ghosts-note.json'), JSON.stringify({ version: 1, cv: '5', ghosts: [{ key: 'n1', version: 3, data: note('GHOST', 2000) }] }));
    const built = buildStore({ dataDir: dir, appId: 'test-app', server: 'ws://127.0.0.1:9', noteEditDelayMs: 10 }, { email: 'test@example.com', token: 'test-token' }, () => {});
    stops.push(built.stopSaving);
    const n1 = built.store.getState().data.notes.get('n1' as never) as { content?: string } | undefined;
    expect(n1?.content).toBe('GHOST');
  });

  it('2: WHEN the server copy is dated 30 s ahead, the edit `MK` was sent and not acknowledged before the quit and snote restarts THEN after a later edit the server and the store hold content `line1\\nline2\\nMK\\nLATER`, verdict `KEPT`', async () => {
    const o = await runScenario('P6-ahead-copy-clean-stop');
    expect(o.server?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.store?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN the server copy is dated 30 s ahead, the edit `MK` was sent and not acknowledged before the quit and snote restarts with a re-index THEN after a later edit the server and the store hold content `line1\\nline2\\nMK\\nLATER`, verdict `KEPT`', async () => {
    const o = await runScenario('P6-ahead-copy-clean-stop-reindex');
    expect(o.server?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.store?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN the server copy is dated 30 s ahead, the edit `MK` was sent and not acknowledged before the quit and a pin made before a crash is lost from state.json and snote restarts THEN after a later edit the server and the store hold content `line1\\nline2\\nMK\\nLATER`, verdict `KEPT`', async () => {
    const o = await runScenario('P8-ahead-copy-pin-crash');
    expect(o.server?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.store?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('5: WHEN the server copy is dated 30 s ahead, the edit `MK` was sent and not acknowledged before the quit and a pin made before a crash is lost from state.json and snote restarts with a re-index THEN after a later edit the server and the store hold content `line1\\nline2\\nMK\\nLATER`, verdict `KEPT`', async () => {
    const o = await runScenario('P8-ahead-copy-pin-crash-reindex');
    expect(o.server?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.store?.content).toBe('line1\nline2\nMK\nLATER');
    expect(o.verdict).toBe('KEPT');
  }, 45000);
});
