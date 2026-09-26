import { describe, it, expect } from 'vitest';
import { selectEditor, editorFinishHint } from '../../src/core/editor-select';

function only(...files: string[]): (file: string) => boolean {
  const set = new Set(files);
  return (f: string) => set.has(f);
}

describe('selectEditor', () => {
  it('1: WHEN selectEditor({ SNOTE_EDITOR: "my-editor --flag" }, () => true) is called (omawrite present on the fake PATH) THEN it returns "my-editor --flag", the explicit override.', () => {
    const result = selectEditor(
      { SNOTE_EDITOR: 'my-editor --flag' },
      () => true,
    );
    expect(result).toBe('my-editor --flag');
  });

  it('2: WHEN selectEditor({ PATH: "/usr/bin" }, (f) => f === "/usr/bin/omawrite") is called with no SNOTE_EDITOR THEN it returns "omawrite".', () => {
    const result = selectEditor(
      { PATH: '/usr/bin' },
      (f) => f === '/usr/bin/omawrite',
    );
    expect(result).toBe('omawrite');
  });

  it('3: WHEN selectEditor({ EDITOR: "code --wait", PATH: "/usr/bin" }, () => false) is called (omawrite not found anywhere) THEN it returns "code --wait".', () => {
    const result = selectEditor(
      { EDITOR: 'code --wait', PATH: '/usr/bin' },
      () => false,
    );
    expect(result).toBe('code --wait');
  });

  it('4: WHEN selectEditor({ PATH: "/usr/bin" }, () => false) is called with no SNOTE_EDITOR, no nvim/omawrite on PATH, and no EDITOR THEN it returns "vi", the final fallback.', () => {
    const result = selectEditor({ PATH: '/usr/bin' }, () => false);
    expect(result).toBe('vi');
  });

  it('5: WHEN selectEditor({ SNOTE_EDITOR: "  ", PATH: "/usr/bin" }, (f) => f === "/usr/bin/omawrite") is called (blank SNOTE_EDITOR) THEN the blank value is treated as unset and it returns "omawrite", not "  ".', () => {
    const result = selectEditor(
      { SNOTE_EDITOR: '  ', PATH: '/usr/bin' },
      (f) => f === '/usr/bin/omawrite',
    );
    expect(result).toBe('omawrite');
  });
});

describe('editorFinishHint', () => {
  it('6: WHEN editorFinishHint("omawrite") is called THEN it returns "save with Ctrl+S and close the window to return"; WHEN editorFinishHint("nvim") is called THEN it returns "Esc then :wq to save and return"; WHEN editorFinishHint("nano") is called THEN it returns "save and close the editor to return".', () => {
    expect(editorFinishHint('omawrite')).toBe(
      'save with Ctrl+S and close the window to return',
    );
    expect(editorFinishHint('nvim')).toBe(
      'Esc then :wq to save and return',
    );
    expect(editorFinishHint('nano')).toBe(
      'save and close the editor to return',
    );
  });
});
