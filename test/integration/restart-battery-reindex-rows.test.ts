/**
 * Issue #20: an edit made after a quit lands on the server exactly once and
 * loses nothing, with a start that re-indexes and (where the rig has one) with
 * a prompt start. The rows run in the restart battery rig (the real buildStore
 * against the fake server).
 */
import { afterEach } from 'vitest';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

type Out = Awaited<ReturnType<typeof runScenario>>;

function kept(id: string, o: Out, content: string): void {
  expect({ id, verdict: o.verdict, pending: o.pending }).toEqual({ id, verdict: 'KEPT', pending: 0 });
  expect({ id, server: o.server?.content, store: o.store?.content }).toEqual({ id, server: content, store: content });
}

describe('issue #20: an edit after a quit lands once', () => {
  it('1: WHEN the pre-quit save MK is on the server, a second save Y was queued and the next start re-indexes THEN server and store hold `line1\\nline2\\nMK\\nY` with MK once', async () => {
    kept('two-saves-reindex', await runScenario('two-saves-reindex'), 'line1\nline2\nMK\nY');
    kept('two-saves', await runScenario('two-saves'), 'line1\nline2\nMK\nY');
  }, 45000);

  it('2: WHEN MK and ZZ were saved with no server and never sent and the next start re-indexes THEN server and store hold `line1\\nline2\\nMK\\nZZ`, each once', async () => {
    kept('never-sent-reindex', await runScenario('never-sent-reindex'), 'line1\nline2\nMK\nZZ');
    kept('never-sent-prompt', await runScenario('never-sent-prompt'), 'line1\nline2\nMK\nZZ');
  }, 45000);

  it('3: WHEN another device moved a line (count-neutral) while snote was closed, with an offline edit, and the next start re-indexes THEN the move and the offline `OFF` are both kept', async () => {
    kept('count-neutral-move-reindex', await runScenario('count-neutral-move-reindex'), 'line2\nline1\nOFF');
    kept('count-neutral-blank-reindex', await runScenario('count-neutral-blank-reindex'), 'line1\n\nline2\n\nOFF');
  }, 45000);

  it('4: WHEN both devices changed line2 and the next start re-indexes THEN both versions are kept as the conflict block `line1\\nline2 MINE\\n\\n--- conflicting change from another device ---\\nline1\\nline2 THEIRS`', async () => {
    kept('same-line-reindex', await runScenario('same-line-reindex'), 'line1\nline2 MINE\n\n--- conflicting change from another device ---\nline1\nline2 THEIRS');
  }, 45000);
});
