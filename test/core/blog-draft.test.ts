import { describe, it, expect } from 'vitest';
import { noteToBlogDraft } from '../../src/core/blog-draft.js';

describe('noteToBlogDraft', () => {
  it('1: WHEN noteToBlogDraft("# Shopping\\n- [ ] milk\\nplain") is called THEN title is "Shopping" and markdown is "- ☐ milk\\nplain"', () => {
    const result = noteToBlogDraft('# Shopping\n- [ ] milk\nplain');
    expect(result.title).toBe('Shopping');
    expect(result.markdown).toBe('- ☐ milk\nplain');
  });

  it('2: WHEN noteToBlogDraft("  Hello  \\n\\nbody") is called THEN title is "Hello" and markdown is "\\nbody"', () => {
    const result = noteToBlogDraft('  Hello  \n\nbody');
    expect(result.title).toBe('Hello');
    expect(result.markdown).toBe('\nbody');
  });

  it('3: WHEN noteToBlogDraft("   \\n\\t") is called THEN it throws an Error whose message is "title is required"', () => {
    expect(() => noteToBlogDraft('   \n\t')).toThrow('title is required');
  });

  it('4: WHEN noteToBlogDraft is called with a 201-character first line THEN it throws an Error whose message is "title is too long"', () => {
    const longTitle = 'a'.repeat(201);
    expect(() => noteToBlogDraft(longTitle)).toThrow('title is too long');
  });

  it('5: WHEN noteToBlogDraft("Only") is called THEN title is "Only" and markdown is the empty string', () => {
    const result = noteToBlogDraft('Only');
    expect(result.title).toBe('Only');
    expect(result.markdown).toBe('');
  });
});
