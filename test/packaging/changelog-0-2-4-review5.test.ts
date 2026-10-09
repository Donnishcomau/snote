import { readFileSync } from 'node:fs'

const log = readFileSync('CHANGELOG.md', 'utf8')
const section = log.slice(log.indexOf('## 0.2.4'), log.indexOf('## 0.2.3'))
const security = section.slice(section.indexOf('### Security'))
const fixed = section.slice(section.indexOf('### Fixed'), section.indexOf('### Security'))
const notes = readFileSync('docs/release-notes-0.2.4.md', 'utf8')

describe('0.2.4 changelog matches the code (review 5)', () => {
  it("1: WHEN the section's `### Security` part is read THEN it contains `git ls-remote`, `plugin's own clone` and `external terminal editor`, and contains neither `runs git outside the clone` nor `nothing reaching the terminal bypasses`", () => {
    for (const w of ['git ls-remote', "plugin's own clone", 'external terminal editor']) {
      expect(security).toContain(w)
    }
    expect(security).not.toContain('runs git outside the clone')
    expect(security).not.toContain('nothing reaching the terminal bypasses')
  })

  it("2: WHEN the section's `### Fixed` part (to `### Security`) is read THEN it contains `catch-up`, `several offline sessions` and `real note count`, and has at least `23` lines starting with `- `", () => {
    const flat = fixed.replace(/\s+/g, ' ')
    for (const w of ['catch-up', 'several offline sessions', 'real note count']) {
      expect(flat).toContain(w)
    }
    expect(fixed.split('\n').filter((l) => l.startsWith('- ')).length).toBeGreaterThanOrEqual(23)
  })

  it("3: WHEN the section's `### Security` part is read THEN it contains `unsynced.json`, `snote --logout`, `localhost`, `error type`, `direction`, `0700` and `0600`, and still contains `OSC 52`, `hex` and `SHA`", () => {
    const flat = security.replace(/\s+/g, ' ')
    for (const w of ['unsynced.json', 'snote --logout', 'localhost', 'error type', 'direction', '0700', '0600', 'OSC 52', 'hex', 'SHA']) {
      expect(flat).toContain(w)
    }
  })

  it('4: WHEN docs/release-notes-0.2.4.md is read THEN it contains `git ls-remote`, `external terminal editor`, `unsynced.json` and `0700`, does not contain `runs git outside the plugin clone`, and `Your saved notes are not changed.` ends the Security paragraph before `## Upgrading`', () => {
    const flat = notes.replace(/\s+/g, ' ')
    for (const w of ['git ls-remote', 'external terminal editor', 'unsynced.json', '0700']) {
      expect(flat).toContain(w)
    }
    expect(flat).not.toContain('runs git outside the plugin clone')
    const para = notes.slice(notes.indexOf('**Security.**'), notes.indexOf('## Upgrading'))
    expect(para.replace(/\s+/g, ' ')).toContain('Your saved notes are not changed.')
    expect(para.split('\n\n')[0].trimEnd().endsWith('Your saved notes are not changed.')).toBe(true)
  })

  it('5: WHEN the section and docs/release-notes-0.2.4.md are read THEN neither contains `@`, `/home/`, `Skryf`, nor a match of `/\\b(T[45]\\d\\d|F1\\d\\d|S5-\\d\\d)\\b/`', () => {
    for (const text of [section, notes]) {
      expect(text).not.toContain('@')
      expect(text).not.toContain('/home/')
      expect(text).not.toContain('Skryf')
      expect(text).not.toMatch(/\b(T[45]\d\d|F1\d\d|S5-\d\d)\b/)
    }
  })
})
