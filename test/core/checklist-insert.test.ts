import { describe, it, expect } from 'vitest';
import { insertChecklistItem, checklistItems } from '../../src/core/checklist';

const C =
  'Groceries\n- [ ] milk\n  - [x] oat milk\nnot a task - [ ] no\n- [X] eggs';

describe('insertChecklistItem', () => {
  it('1: insertChecklistItem(C, 0, " bread ") inserts "- [ ] bread" after item 0', () => {
    const result = insertChecklistItem(C, 0, ' bread ');
    expect(result).toBe(
      'Groceries\n- [ ] milk\n- [ ] bread\n  - [x] oat milk\nnot a task - [ ] no\n- [X] eggs',
    );
  });

  it('2: insertChecklistItem(C, 1, "soy") inserts indented line after item 1', () => {
    const result = insertChecklistItem(C, 1, 'soy');
    const lines = result.split('\n');
    expect(lines[3]).toBe('  - [ ] soy');
    expect(lines[2]).toBe('  - [x] oat milk');
  });

  it('3: insertChecklistItem(C, 2, "tea") appends; also for out-of-range afterIndex', () => {
    const result = insertChecklistItem(C, 2, 'tea');
    expect(result).toBe(C + '\n- [ ] tea');

    const result7 = insertChecklistItem(C, 7, 'tea');
    expect(result7).toBe(C + '\n- [ ] tea');

    const resultNeg1 = insertChecklistItem(C, -1, 'tea');
    expect(resultNeg1).toBe(C + '\n- [ ] tea');
  });

  it('4: plain note, trailing newline, and empty content', () => {
    expect(insertChecklistItem('Plain note', 0, 'first')).toBe(
      'Plain note\n- [ ] first',
    );
    expect(insertChecklistItem('Plain note\n', 0, 'first')).toBe(
      'Plain note\n- [ ] first',
    );
    expect(insertChecklistItem('', 0, 'first')).toBe('- [ ] first');
  });

  it('5: insertChecklistItem(C, 0, "   ") returns C unchanged', () => {
    const result = insertChecklistItem(C, 0, '   ');
    expect(result).toBe(C);
  });

  it('6: result of line 1 parsed by checklistItems has 4 items, item 1 is bread', () => {
    const result = insertChecklistItem(C, 0, ' bread ');
    const items = checklistItems(result);
    expect(items).toHaveLength(4);
    expect(items[1]).toEqual({ line: 2, checked: false, text: 'bread' });
  });
});
