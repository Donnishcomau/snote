import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const agentsGuide = readFileSync('AGENTS.md', 'utf8');
const security = readFileSync('SECURITY.md', 'utf8');
const contributing = readFileSync('CONTRIBUTING.md', 'utf8');

describe('public agent guide, SECURITY.md, and CONTRIBUTING.md (T308)', () => {
  it('1: WHEN AGENTS.md is read THEN it contains docs/ARCHITECTURE.md, // OMARCHY:, and vi.waitFor', () => {
    expect(agentsGuide).toContain('docs/ARCHITECTURE.md');
    expect(agentsGuide).toContain('// OMARCHY:');
    expect(agentsGuide).toContain('vi.waitFor');
  });

  it('2: WHEN AGENTS.md is read THEN it contains sanitizeForTerminal, secureMkdir, and instance-lock', () => {
    expect(agentsGuide).toContain('sanitizeForTerminal');
    expect(agentsGuide).toContain('secureMkdir');
    expect(agentsGuide).toContain('instance-lock');
  });

  it('3: WHEN AGENTS.md is read THEN it contains none of .loop, TASKS.md, opencode', () => {
    expect(agentsGuide).not.toContain('.loop');
    expect(agentsGuide).not.toContain('TASKS.md');
    expect(agentsGuide).not.toContain('opencode');
  });

  it('4: WHEN SECURITY.md is read THEN it contains security advisories and donnishcomau/snote', () => {
    expect(security).toContain('security advisories');
    expect(security).toContain('donnishcomau/snote');
  });

  it('5: WHEN CONTRIBUTING.md is read THEN it contains AGENTS.md and does not contain .claude/skills/snote-fix', () => {
    expect(contributing).toContain('AGENTS.md');
    expect(contributing).not.toContain('.claude/skills/snote-fix');
  });
});
