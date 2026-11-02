import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { secureExclusiveCreate } from '../../src/core/secure-fs';
import { logout, saveToken } from '../../src/core/token';

describe('logout-sweep-marker', () => {
  let tmp: string;
  let dir: string;
  let sub: string;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f324-'));
    dir = path.join(tmp, 'data');
    fs.mkdirSync(dir);
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    sub = path.join(dir, 'a@b.co');
    fs.mkdirSync(sub);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN a killed takeover left instance.lock.sweep in the account folder (asserted present before logout) THEN logout removes the folder and readdir(data folder) is []', async () => {
    secureExclusiveCreate(path.join(sub, 'instance.lock.sweep'), '');
    expect(fs.existsSync(path.join(sub, 'instance.lock.sweep'))).toBe(true);
    await logout(dir);
    expect(fs.existsSync(sub)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('2: WHEN there is no marker (the account folder asserted present before logout) THEN logout removes the folder', async () => {
    fs.writeFileSync(path.join(sub, 'state.json'), '{}');
    expect(fs.existsSync(sub)).toBe(true);
    await logout(dir);
    expect(fs.existsSync(sub)).toBe(false);
  });

  it('3: WHEN the folder holds instance.lock.sweep and a file snote did not write (notes.txt) THEN logout removes the marker, notes.txt keeps its exact bytes and the folder stays', async () => {
    secureExclusiveCreate(path.join(sub, 'instance.lock.sweep'), '');
    fs.writeFileSync(path.join(sub, 'notes.txt'), 'mine\n');
    expect(fs.existsSync(path.join(sub, 'instance.lock.sweep'))).toBe(true);
    await logout(dir);
    expect(fs.existsSync(path.join(sub, 'instance.lock.sweep'))).toBe(false);
    expect(fs.readFileSync(path.join(sub, 'notes.txt'), 'utf8')).toBe('mine\n');
    expect(fs.existsSync(sub)).toBe(true);
  });
});
