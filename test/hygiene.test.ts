import fs from 'fs';
import path from 'path';

describe('hygiene', () => {
  it('1: WHEN the repo is read THEN test/type-test.ts does not exist and test/setup.ts exists', () => {
    const root = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(root, 'test', 'type-test.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'test', 'setup.ts'))).toBe(true);
  });

  it('2: WHEN the entries of test/ ending in .ts or .tsx are listed THEN the list includes setup.ts and keymap.test.ts, and every entry ends in .test.ts or .test.tsx or is setup.ts', () => {
    const testDir = path.resolve(__dirname);
    const entries = fs.readdirSync(testDir).filter((name) => {
      return name.endsWith('.ts') || name.endsWith('.tsx');
    });
    expect(entries).toContain('setup.ts');
    expect(entries).toContain('keymap.test.ts');
    entries.forEach((entry) => {
      expect(entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') || entry === 'setup.ts').toBe(true);
    });
  });

  it('3: WHEN test/fake-simperium/server.ts is read as text THEN it does not contain console.log( and it still contains [TEST] WebSocket error', () => {
    const serverPath = path.resolve(__dirname, 'fake-simperium', 'server.ts');
    const content = fs.readFileSync(serverPath, 'utf8');
    expect(content).not.toContain('console.log(');
    expect(content).toContain('[TEST] WebSocket error');
  });

  it('4: WHEN every .ts/.tsx file directly in src/core and src/tui is read THEN at least 10 files were read, among them store.ts and App.tsx, and none contains console.log(', () => {
    const coreDir = path.resolve(__dirname, '..', 'src', 'core');
    const tuiDir = path.resolve(__dirname, '..', 'src', 'tui');

    const files: string[] = [];
    for (const dir of [coreDir, tuiDir]) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          const filePath = path.join(dir, entry);
          files.push(filePath);
        }
      }
    }

    expect(files.length).toBeGreaterThanOrEqual(10);

    const fileNames = files.map((f) => path.basename(f));
    expect(fileNames).toContain('store.ts');
    expect(fileNames).toContain('App.tsx');

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toContain('console.log(');
    }
  });
});
