import { holdId, releaseId, releaseAll, isHeld } from '../../src/core/held-unsynced';

describe('held-unsynced: per-store registry of held note ids', () => {
  it('1: WHEN holdId(storeA, "n1") runs THEN isHeld(storeA, "n1") is true, isHeld(storeA, "n2") is false and isHeld(storeB, "n1") is false', () => {
    const storeA = {};
    const storeB = {};
    holdId(storeA, 'n1');
    expect(isHeld(storeA, 'n1')).toBe(true);
    expect(isHeld(storeA, 'n2')).toBe(false);
    expect(isHeld(storeB, 'n1')).toBe(false);
  });

  it('2: WHEN n1 and n2 are held on storeA and releaseId(storeA, "n1") runs THEN isHeld(storeA, "n1") is false and isHeld(storeA, "n2") is true', () => {
    const storeA = {};
    holdId(storeA, 'n1');
    holdId(storeA, 'n2');
    releaseId(storeA, 'n1');
    expect(isHeld(storeA, 'n1')).toBe(false);
    expect(isHeld(storeA, 'n2')).toBe(true);
  });

  it('3: WHEN n1 and n2 are held on storeA and n1 on storeB and releaseAll(storeA) runs THEN isHeld(storeA, "n1") and isHeld(storeA, "n2") are false and isHeld(storeB, "n1") is true', () => {
    const storeA = {};
    const storeB = {};
    holdId(storeA, 'n1');
    holdId(storeA, 'n2');
    holdId(storeB, 'n1');
    releaseAll(storeA);
    expect(isHeld(storeA, 'n1')).toBe(false);
    expect(isHeld(storeA, 'n2')).toBe(false);
    expect(isHeld(storeB, 'n1')).toBe(true);
  });

  it('4: WHEN a store never had a hold and releaseId(store, "n1") and releaseAll(store) run THEN neither throws and isHeld(store, "n1") is false', () => {
    const store = {};
    expect(() => releaseId(store, 'n1')).not.toThrow();
    expect(() => releaseAll(store)).not.toThrow();
    expect(isHeld(store, 'n1')).toBe(false);
  });
});
