import { describe, it, expect } from 'vitest';
import { paneLayout } from '../../src/core/layout';

describe('layout-widths: tags column shrink', () => {
  it('1: WHEN paneLayout(80, true, false, false) is called THEN it returns { tagsWidth: 14, listWidthProp: 66, previewWidthProp: 66 }', () => {
    const result = paneLayout(80, true, false, false);
    expect(result).toEqual({ tagsWidth: 14, listWidthProp: 66, previewWidthProp: 66 });
  });

  it('2: WHEN paneLayout(120, true, false, false) is called THEN it returns { tagsWidth: 14, listWidthProp: 106, previewWidthProp: 106 }', () => {
    const result = paneLayout(120, true, false, false);
    expect(result).toEqual({ tagsWidth: 14, listWidthProp: 106, previewWidthProp: 106 });
  });

  it('3: WHEN paneLayout(80, false, false, false) is called (tags closed) THEN it returns { tagsWidth: 0, listWidthProp: 80, previewWidthProp: 80 }, unchanged from before this task', () => {
    const result = paneLayout(80, false, false, false);
    expect(result).toEqual({ tagsWidth: 0, listWidthProp: 80, previewWidthProp: 80 });
  });

  it('4: WHEN paneLayout(60, true, false, false) is called (the 50<=width<80 breakpoint) THEN it still returns { tagsWidth: 20, listWidthProp: 100, previewWidthProp: 0 }, unchanged from before this task', () => {
    const result = paneLayout(60, true, false, false);
    expect(result).toEqual({ tagsWidth: 20, listWidthProp: 100, previewWidthProp: 0 });
  });

  it('5: WHEN paneLayout(40, true, true, false) is called (the width<50 breakpoint, tags focused) THEN it still returns { tagsWidth: 40, listWidthProp: 0, previewWidthProp: 0 }, unchanged from before this task', () => {
    const result = paneLayout(40, true, true, false);
    expect(result).toEqual({ tagsWidth: 40, listWidthProp: 0, previewWidthProp: 0 });
  });
});
