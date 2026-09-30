import { describe, it, expect } from 'vitest';
import { checklistGlyphs } from '../../src/core/blog-markdown';

describe('checklistGlyphs', () => {
  it('1: checklistGlyphs("- [ ] milk\\n- [x] eggs\\n- [X] bread\\nplain") returns the checked/unchecked glyphs', () => {
    const result = checklistGlyphs('- [ ] milk\n- [x] eggs\n- [X] bread\nplain');
    expect(result).toBe('- ☐ milk\n- ☑ eggs\n- ☑ bread\nplain');
  });

  it('2: checklistGlyphs("- [ ]\\n  - [ ] nested\\n- [x]") returns unchanged', () => {
    const result = checklistGlyphs('- [ ]\n  - [ ] nested\n- [x]');
    expect(result).toBe('- [ ]\n  - [ ] nested\n- [x]');
  });

  it('3: checklistGlyphs("") returns the empty string', () => {
    const result = checklistGlyphs('');
    expect(result).toBe('');
  });

  it('4: checklistGlyphs("- [ ] milk") called twice returns equal results', () => {
    const result1 = checklistGlyphs('- [ ] milk');
    const result2 = checklistGlyphs('- [ ] milk');
    expect(result1).toBe('- ☐ milk');
    expect(result2).toBe('- ☐ milk');
    expect(result1).toBe(result2);
  });
});
