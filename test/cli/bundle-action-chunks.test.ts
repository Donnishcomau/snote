/**
 * snote-diet: the code that runs only after a user action (sending a note to
 * the blog, saving the blog token, writing an export) is loaded by `import()`
 * when that action runs, so it is not part of the plugin-dist start set that
 * test/cli/bundle-split.test.ts caps.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSplitDist, chunkGraph, type ChunkGraph } from '../helpers/bundle-size';

const LAZY_FUNCTIONS = ['sendNoteToBlog', 'postBlogDraft', 'noteToBlogDraft', 'checklistGlyphs', 'recordBlogSend', 'saveBlogConfig', 'loadBlogConfig', 'exportNote'];
const LAZY_MODULES = ['blog-send', 'blog-config', 'blog-sent', 'export-note'];
// the lazy modules themselves, and the ones only they import, may import each other statically
const LAZY_SIDE = ['blog-send', 'blog-config', 'blog-sent', 'export-note', 'blog-client', 'blog-draft', 'blog-markdown'];

const dirs: string[] = [];
let dist = '';
let graph: ChunkGraph;

const defines = (text: string, name: string): boolean => new RegExp(`function ${name}\\d*\\(`).test(text);
const chunkFile = (prefix: string): string | undefined => fs.readdirSync(path.join(dist, 'chunks')).find((f) => f.startsWith(`${prefix}-`));

function srcFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? srcFiles(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
}

beforeAll(async () => {
  dist = await buildSplitDist();
  dirs.push(dist);
  graph = chunkGraph(dist);
}, 60000);

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('snote-diet user-action code is lazy', () => {
  it('1: WHEN the split plugin-dist is built THEN no start-set file defines `sendNoteToBlog`, `postBlogDraft`, `noteToBlogDraft`, `checklistGlyphs`, `recordBlogSend`, `saveBlogConfig`, `loadBlogConfig` or `exportNote`, and each is defined in a chunk outside the start set', () => {
    expect(graph.start.has('snote-main.js')).toBe(true);
    const startText = [...graph.start.keys()].map((rel) => fs.readFileSync(path.join(dist, rel), 'utf8'));
    const lazyText = fs.readdirSync(path.join(dist, 'chunks')).filter((f) => !graph.start.has(path.join('chunks', f))).map((f) => fs.readFileSync(path.join(dist, 'chunks', f), 'utf8'));
    expect(LAZY_FUNCTIONS).toEqual(['sendNoteToBlog', 'postBlogDraft', 'noteToBlogDraft', 'checklistGlyphs', 'recordBlogSend', 'saveBlogConfig', 'loadBlogConfig', 'exportNote']);
    for (const name of LAZY_FUNCTIONS) {
      expect(startText.filter((t) => defines(t, name)).length, `${name} in the start set`).toBe(0);
      expect(lazyText.filter((t) => defines(t, name)).length, `${name} in a lazy chunk`).toBe(1);
    }
  });

  it('2: WHEN src is scanned THEN no module but the lazy ones imports `blog-send`, `blog-config`, `blog-sent` or `export-note` statically, and `blog-send`, `blog-config` and `export-note` are each loaded with `import(`', () => {
    const root = path.join(process.cwd(), 'src');
    const files = srcFiles(root);
    for (const m of LAZY_MODULES) {
      const staticRe = new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+['"][./]+(?:core/)?${m}(?:\\.js)?['"]`, 'm');
      const dynamicRe = new RegExp(`import\\(\\s*['"][./]+(?:core/)?${m}(?:\\.js)?['"]\\s*\\)`);
      const eager = files.filter((f) => staticRe.test(fs.readFileSync(f, 'utf8')) && !LAZY_SIDE.includes(path.basename(f).replace(/\.tsx?$/, '')));
      expect(eager.map((f) => path.relative(root, f)), m).toEqual([]);
      if (m !== 'blog-sent') expect(files.filter((f) => dynamicRe.test(fs.readFileSync(f, 'utf8'))).length, m).toBeGreaterThan(0);
    }
  });

  it('3: WHEN the export chunk of the split plugin-dist is loaded with `import()` and its `exportNote` writes a note `# Hello` / `world` tagged `a`, `b` THEN the file is `Hello.md` holding `# Hello`, `world` and `Tags:`, and the blog-send chunk exports `sendNoteToBlog`', async () => {
    const exportChunk = chunkFile('export-note');
    const sendChunk = chunkFile('blog-send');
    expect(exportChunk).toBeDefined();
    expect(sendChunk).toBeDefined();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-diet-export-'));
    dirs.push(out);
    const exp = (await import(pathToFileURL(path.join(dist, 'chunks', exportChunk!)).href)) as { exportNote: (note: { content: string; tags: string[] }, dir: string) => Promise<string> };
    const written = await exp.exportNote({ content: '# Hello\nworld', tags: ['a', 'b'] }, out);
    expect(path.basename(written)).toBe('Hello.md');
    expect(fs.readFileSync(written, 'utf8')).toBe('# Hello\nworld\n\nTags:\n  a, b');
    const send = (await import(pathToFileURL(path.join(dist, 'chunks', sendChunk!)).href)) as { sendNoteToBlog?: unknown };
    expect(typeof send.sendNoteToBlog).toBe('function');
  });
});
