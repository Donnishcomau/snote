import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { saveBlogConfig, loadBlogConfig } from '../../src/core/blog-config';

let tmpDir: string;

function setupTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blog-config-test-'));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('blog-config', () => {
  beforeEach(() => {
    tmpDir = setupTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it('1: WHEN origin https://blog.example and token secret-token are saved and loaded THEN both values match and the file mode is 0o600', async () => {
    await saveBlogConfig(tmpDir, {
      origin: 'https://blog.example',
      token: 'secret-token',
    });

    const config = await loadBlogConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.origin).toBe('https://blog.example');
    expect(config!.token).toBe('secret-token');

    const filePath = path.join(tmpDir, 'blog.json');
    const stats = fs.statSync(filePath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('2: WHEN saveBlogConfig is given origin https://blog.example/ THEN the stored origin is https://blog.example', async () => {
    await saveBlogConfig(tmpDir, {
      origin: 'https://blog.example/',
      token: 'secret-token',
    });

    const config = await loadBlogConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.origin).toBe('https://blog.example');
  });

  it('3: WHEN loadBlogConfig is called on an empty temp directory THEN it returns null and auth.json does not exist', async () => {
    const result = await loadBlogConfig(tmpDir);
    expect(result).toBeNull();

    const authPath = path.join(tmpDir, 'auth.json');
    expect(fs.existsSync(authPath)).toBe(false);
  });

  it('4: WHEN blog.json contains not-json THEN loadBlogConfig returns null', async () => {
    const blogPath = path.join(tmpDir, 'blog.json');
    fs.writeFileSync(blogPath, 'not-json', { encoding: 'utf8' });

    const result = await loadBlogConfig(tmpDir);
    expect(result).toBeNull();
  });

  it('5: WHEN saveBlogConfig is given origin http://blog.example THEN it throws and blog.json does not exist', async () => {
    const blogPath = path.join(tmpDir, 'blog.json');
    await expect(
      saveBlogConfig(tmpDir, {
        origin: 'http://blog.example',
        token: 'secret-token',
      }),
    ).rejects.toThrow();

    expect(fs.existsSync(blogPath)).toBe(false);
  });
});
