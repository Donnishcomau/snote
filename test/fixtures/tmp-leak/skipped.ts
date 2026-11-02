// #407 nested-run fixture (not *.test.ts, so the normal run never collects it): every test is skipped, as in a file that skips as a whole.
describe.skipIf(true)('skipped', () => {
  it('never runs', () => {
    expect(1).toBe(1);
  });
});
