import { describe, it, expect } from 'vitest';
import { checklistItems, toggleChecklistItem } from '../../src/core/checklist';

const C = 'Groceries\n- [ ] milk\n  - [x] oat milk\nnot a task - [ ] no\n- [X] eggs';

describe('checklist', () => {
  it('1: checklistItems(C) returns exactly 3 items on line 1, 2, 4', () => {
    const result = checklistItems(C);
    expect(result).toEqual([
      { line: 1, checked: false, text: 'milk' },
      { line: 2, checked: true, text: 'oat milk' },
      { line: 4, checked: true, text: 'eggs' },
    ]);
  });

  it('2: toggleChecklistItem(C, 0) toggles milk to checked', () => {
    const result = toggleChecklistItem(C, 0);
    expect(result).toBe(
      'Groceries\n- [x] milk\n  - [x] oat milk\nnot a task - [ ] no\n- [X] eggs'
    );
  });

  it('3: toggleChecklistItem(C, 1) and toggleChecklistItem(C, 2) toggle correctly', () => {
    const result1 = toggleChecklistItem(C, 1);
    const lines1 = result1.split('\n');
    expect(lines1[2]).toBe('  - [ ] oat milk');
    for (const [i, orig] of C.split('\n').entries()) {
      if (i === 2) continue;
      expect(lines1[i]).toBe(orig);
    }

    const result2 = toggleChecklistItem(C, 2);
    const lines2 = result2.split('\n');
    expect(lines2[4]).toBe('- [ ] eggs');
  });

  it('4: invalid indices return C unchanged (toStrictEqual)', () => {
    expect(toggleChecklistItem(C, 3)).toBe(C);
    expect(toggleChecklistItem(C, -1)).toBe(C);
    expect(toggleChecklistItem(C, 0.5)).toBe(C);
  });

  it('5: empty and no-task content returns []', () => {
    expect(checklistItems('')).toEqual([]);
    expect(checklistItems('- [ ]')).toEqual([]);
    expect(checklistItems('Just text\nmore text')).toEqual([]);
  });

  it('6: checklistItems(C) is stable and toggle twice gives C back', () => {
    const a = checklistItems(C);
    const b = checklistItems(C);
    expect(a).toEqual(b);

    const toggled = toggleChecklistItem(C, 0);
    const back = toggleChecklistItem(toggled, 0);
    expect(back).toBe(C);
  });
});
