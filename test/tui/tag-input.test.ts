import { describe, it, expect, vi } from 'vitest';
import { suggestTag, tagInputStep, type TagKey } from '../../src/tui/tag-input';

describe('T102 tag-input pure functions', () => {
  const all = ['home', 'work', 'Web'];
  const tags = ['home', 'x1'];

  it('1: WHEN suggestTag gets wo, WE, ho and the empty string THEN it returns work, Web, null and null', () => {
    expect(suggestTag('wo', all, tags)).toBe('work');
    expect(suggestTag('WE', all, tags)).toBe('Web');
    expect(suggestTag('ho', all, tags)).toBeNull();
    expect(suggestTag('', all, tags)).toBeNull();
  });

  it('2: WHEN tagInputStep with input "o" and {} THEN text becomes "wo"; with ctrl:true text stays "w"', () => {
    const result1 = tagInputStep('w', 'o', {}, tags, all);
    expect(result1).toEqual({ text: 'wo' });

    const result2 = tagInputStep('w', 'o', { ctrl: true }, tags, all);
    expect(result2).toEqual({ text: 'w' });
  });

  it('3: WHEN key is {return:true} with text " work " THEN text empty and add "work"; "HOME" gives text empty no add; two spaces gives same text no add', () => {
    const r1 = tagInputStep(' work ', '\r', { return: true }, tags, all);
    expect(r1).toEqual({ text: '', add: 'work' });

    const r2 = tagInputStep('HOME', '', { return: true }, tags, all);
    expect(r2).toEqual({ text: '' });
    expect(r2.add).toBeUndefined();

    const r3 = tagInputStep('  ', '', { return: true }, tags, all);
    expect(r3).toEqual({ text: '  ' });
    expect(r3.add).toBeUndefined();
  });

  it('4: WHEN key is {tab:true} THEN text "wo" becomes "work"; text "zz" stays "zz"; no add key', () => {
    const r1 = tagInputStep('wo', '', { tab: true }, tags, all);
    expect(r1).toEqual({ text: 'work' });
    expect(r1.add).toBeUndefined();

    const r2 = tagInputStep('zz', '', { tab: true }, tags, all);
    expect(r2).toEqual({ text: 'zz' });
    expect(r2.add).toBeUndefined();
  });

  it('5: WHEN key is {backspace:true} THEN text "wo" gives "w" no remove; empty text gives remove "x1"; empty tags gives no remove', () => {
    const r1 = tagInputStep('wo', '', { backspace: true }, tags, all);
    expect(r1).toEqual({ text: 'w' });
    expect(r1.remove).toBeUndefined();

    const r2 = tagInputStep('', '', { backspace: true }, tags, all);
    expect(r2).toEqual({ text: '', remove: 'x1' });

    const r3 = tagInputStep('', '', { backspace: true }, [], all);
    expect(r3).toEqual({ text: '' });
    expect(r3.remove).toBeUndefined();
  });

  it('6: WHEN key is {escape:true} with text "wo" THEN close:true, text "wo", no add; tags still length 2', () => {
    const r = tagInputStep('wo', '', { escape: true }, tags, all);
    expect(r).toEqual({ text: 'wo', close: true });
    expect(r.add).toBeUndefined();
    expect(tags.length).toBe(2);
  });
});
