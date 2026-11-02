// #310 nested-run fixture (not *.test.ts, so the normal run never collects it). The outer test sets PROBE_MODE.
import fs from 'node:fs';
import path from 'node:path';

describe('probe', () => {
  it('runs', async () => {
    const mode = process.env.PROBE_MODE ?? 'pass';
    if (mode === 'fail') expect(1).toBe(2);
    if (mode === 'status') {
      const dir = process.env.SNOTE_STATUS_DIR!;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'status.json'), '{}');
    }
    if (mode === 'kill') process.kill(process.pid, 'SIGKILL');
    if (mode === 'wait') {
      const signal = process.env.PROBE_SIGNAL!;
      const until = Date.now() + 2000;
      while (!fs.existsSync(signal) && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
      expect(fs.existsSync(signal)).toBe(true);
    }
  });
});
