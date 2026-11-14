/**
 * #723: the committed public images and docs/screenshots/CAPTURED keep a fixed shape.
 * Equality with package.json or the inputs id is a CHECK (C8), not a test. The capture
 * itself needs the test host and exceeds the 3 s budget, so it is a CHECK too.
 */
import { existsSync, readFileSync } from 'node:fs';

const STILLS = [
  'docs/screenshots/main.png',
  'docs/screenshots/markdown.png',
  'docs/screenshots/search.png',
  'docs/screenshots/update.png',
  'docs/screenshots/light.png',
];

const PNGS = [...STILLS, 'preview.png', 'docs/social-preview.png'];

const FORBIDDEN = ['tEXt', 'iTXt', 'zTXt', 'eXIf', '/home/', '/Users/'];

/** Width and height from the IHDR chunk (8-byte signature, 4-byte length, the type, then the two uint32s). */
function ihdr(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('#723 captured images keep their shape', () => {
  it('1: WHEN docs/screenshots/CAPTURED is read THEN it is one line: a three-part version, one space, 40 lowercase hex and a newline, and nothing else', () => {
    const text = readFileSync('docs/screenshots/CAPTURED', 'utf8');
    const newline = text.lastIndexOf('\n');
    expect({
      oneLine: text.endsWith('\n') && newline === text.length - 1 && !text.includes('\r'),
      line: text.slice(0, Math.max(newline, 0)),
    }).toEqual({
      oneLine: true,
      line: expect.stringMatching(/^\d+\.\d+\.\d+ [0-9a-f]{40}$/),
    });
  });

  it('2: WHEN the five stills are read THEN each IHDR is 1086 by 670, preview.png is 1248 by 624, docs/social-preview.png is 1280 by 640, light.png differs from main.png, and update.png differs from main.png', () => {
    expect(STILLS.map((p) => ihdr(p))).toEqual(STILLS.map(() => ({ width: 1086, height: 670 })));
    expect(ihdr('preview.png')).toEqual({ width: 1248, height: 624 });
    expect(ihdr('docs/social-preview.png')).toEqual({ width: 1280, height: 640 });
    expect(readFileSync('docs/screenshots/light.png').equals(readFileSync('docs/screenshots/main.png'))).toBe(false);
    expect(readFileSync('docs/screenshots/update.png').equals(readFileSync('docs/screenshots/main.png'))).toBe(false);
  });

  it('3: WHEN the PNGs and demo.gif are read as bytes THEN none contains tEXt, iTXt, zTXt, eXIf, /home/ or /Users/', () => {
    const hits = [...PNGS, 'docs/screenshots/demo.gif'].flatMap((p) => {
      const buf = readFileSync(p);
      return FORBIDDEN.filter((n) => buf.includes(Buffer.from(n))).map((n) => `${p} ${n}`);
    });
    expect(hits).toEqual([]);
  });

  it('4: WHEN docs/screenshots/demo.gif is read THEN it begins with GIF89a, the logical screen is 1086 by 670, and the bytes contain NETSCAPE2.0', () => {
    const buf = readFileSync('docs/screenshots/demo.gif');
    expect({
      magic: buf.subarray(0, 6).toString('latin1'),
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
      loop: buf.includes(Buffer.from('NETSCAPE2.0')),
    }).toEqual({ magic: 'GIF89a', width: 1086, height: 670, loop: true });
  });

  it('5: WHEN README.md and docs/screenshots are read THEN README.md references exactly the five stills in order, each with width="830" and each ending with the line-break tag, each alt text is present and holds no three-part version, the update.png alt equals the version-free banner wording, and neither the README nor docs/screenshots holds tags.png or help.png', () => {
    const readme = readFileSync('README.md', 'utf8');
    const shots = readme.split('\n').filter((l) => l.includes('<img') && l.includes('docs/screenshots/'));
    expect(shots.map((l) => /docs\/screenshots\/[a-z]+\.png/.exec(l)?.[0])).toEqual(STILLS);
    expect(shots).toHaveLength(5);
    for (const l of shots) {
      expect(l).toContain('width="830"');
      expect(l.endsWith('<br>')).toBe(true);
      const alt = /alt="([^"]*)"/.exec(l)?.[1];
      expect(alt).toEqual(expect.any(String));
      expect(alt ?? '').not.toMatch(/\d+\.\d+\.\d+/);
    }
    const update = shots.find((l) => l.includes('docs/screenshots/update.png'));
    expect(/alt="([^"]*)"/.exec(update ?? '')?.[1]).toBe(
      'The note list with a banner saying a newer version of snote is available',
    );
    expect(readme).not.toContain('tags.png');
    expect(readme).not.toContain('help.png');
    expect(existsSync('docs/screenshots/tags.png')).toBe(false);
    expect(existsSync('docs/screenshots/help.png')).toBe(false);
  });
});
