import { describe, it, expect } from 'vitest';
import { paneLayout, shouldAutoOpenTags } from '../../src/core/layout';

describe('paneLayout and shouldAutoOpenTags', () => {
  it('1: paneLayout(120, false, false) and paneLayout(80, true, true)', () => {
    const a = paneLayout(120, false, false);
    const b = paneLayout(80, true, true);
    expect(a).toEqual({ tagsWidth: 0, listWidthProp: 120, previewWidthProp: 120 });
    expect(b).toEqual({ tagsWidth: 14, listWidthProp: 66, previewWidthProp: 66 });
  });

  it('2: paneLayout(60, false, false) and paneLayout(60, true, false)', () => {
    const a = paneLayout(60, false, false);
    const b = paneLayout(60, true, false);
    expect(a).toEqual({ tagsWidth: 0, listWidthProp: 60, previewWidthProp: 60 });
    expect(b).toEqual({ tagsWidth: 20, listWidthProp: 100, previewWidthProp: 0 });
  });

  it('3: paneLayout(40, false, false), paneLayout(40, true, false) and paneLayout(40, true, true)', () => {
    const a = paneLayout(40, false, false);
    const b = paneLayout(40, true, false);
    const c = paneLayout(40, true, true);
    expect(a).toEqual({ tagsWidth: 0, listWidthProp: 100, previewWidthProp: 0 });
    expect(b).toEqual({ tagsWidth: 0, listWidthProp: 100, previewWidthProp: 0 });
    expect(c).toEqual({ tagsWidth: 40, listWidthProp: 0, previewWidthProp: 0 });
  });

  it('4: paneLayout(w, open, false) for w 20..79, both open values', () => {
    let zeroPreviewCount = 0;
    for (let w = 20; w <= 79; w++) {
      for (const open of [false, true] as const) {
        const result = paneLayout(w, open, false);
        const { tagsWidth, previewWidthProp, listWidthProp } = result;
        if (previewWidthProp === 0) {
          // check: Math.floor(listWidthProp * 0.4) === w - tagsWidth
          expect(Math.floor(listWidthProp * 0.4)).toBe(w - tagsWidth);
          zeroPreviewCount++;
        }
      }
    }
    expect(zeroPreviewCount).toBeGreaterThanOrEqual(60);
  });

  it('5: shouldAutoOpenTags', () => {
    expect(shouldAutoOpenTags(100, 1)).toBe(true);
    expect(shouldAutoOpenTags(99, 1)).toBe(false);
    expect(shouldAutoOpenTags(120, 0)).toBe(false);
    expect(shouldAutoOpenTags(200, 3)).toBe(true);
  });

  it('6: paneLayout(79, true, true), paneLayout(50, false, true) and paneLayout(49, false, true)', () => {
    const a = paneLayout(79, true, true);
    const b = paneLayout(50, false, true);
    const c = paneLayout(49, false, true);
    expect(a.listWidthProp).toBe(148);
    expect(a.previewWidthProp).toBe(0);
    expect(a.tagsWidth).toBe(20);

    expect(b.listWidthProp).toBe(50);
    expect(b.previewWidthProp).toBe(50);
    expect(b.tagsWidth).toBe(0);

    expect(c.listWidthProp).toBe(123);
    expect(c.previewWidthProp).toBe(0);
    expect(c.tagsWidth).toBe(0);
  });
});
