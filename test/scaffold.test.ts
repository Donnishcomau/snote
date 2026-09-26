import { describe, it, expect } from 'vitest';
import { getTitle } from '../vendor/simplenote/utils/note-utils';
describe('scaffold', () => {
  it('vendored note-utils loads and computes a title', () => {
    expect(getTitle('# Hello\nbody')).toBe('# Hello');
  });
});
