import { describe, it, expect } from 'vitest';
import { paneLayout } from '../../src/core/layout';

describe('paneLayout reading mode', () => {
  it('1: paneLayout(40, false, false, true) and paneLayout(49, false, false, true)', () => {
    const a = paneLayout(40, false, false, true);
    expect(a).toEqual({ tagsWidth: 0, listWidthProp: 0, previewWidthProp: 65 });
    const b = paneLayout(49, false, false, true);
    expect(b.previewWidthProp).toBe(80);
  });

  it('2: paneLayout(40, false, false, false) and paneLayout(40, false, false)', () => {
    const a = paneLayout(40, false, false, false);
    expect(a).toEqual({ tagsWidth: 0, listWidthProp: 100, previewWidthProp: 0 });
    const b = paneLayout(40, false, false);
    expect(b).toEqual({ tagsWidth: 0, listWidthProp: 100, previewWidthProp: 0 });
  });

  it('3: paneLayout(40, true, true, true) and paneLayout(40, true, false, true)', () => {
    const a = paneLayout(40, true, true, true);
    expect(a).toEqual({ tagsWidth: 40, listWidthProp: 0, previewWidthProp: 0 });
    const b = paneLayout(40, true, false, true);
    expect(b.previewWidthProp).toBe(65);
    expect(b.tagsWidth).toBe(0);
  });

  it('4: reading changes nothing at 50 columns and more', () => {
    expect(paneLayout(50, false, false, true)).toEqual(paneLayout(50, false, false, false));
    expect(paneLayout(60, true, false, true)).toEqual(paneLayout(60, true, false, false));
    expect(paneLayout(120, true, false, true)).toEqual(paneLayout(120, true, false, false));
  });

  it('5: paneLayout(w, false, false, true) for w 10..49 yields correct preview width', () => {
    for (let w = 10; w <= 49; w++) {
      const result = paneLayout(w, false, false, true);
      expect(result.tagsWidth).toBe(0);
      expect(result.listWidthProp).toBe(0);
      expect(Math.floor(result.previewWidthProp * 0.6) + 1).toBe(w);
    }
  });
});
