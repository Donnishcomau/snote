---
name: Bug report
about: Report a problem with snote
title: ''
labels: bug
assignees: ''
---

## Diagnostic bundle

Please run `snote --report` and attach the resulting `report-*.json` file to
this issue. It captures the editor, data dir, terminal size, and other
diagnostics that make the problem much faster to reproduce.

## Environment

- **snote version:** (`snote --version`, or `pacman -Q snote`)
- **Terminal emulator:** (e.g. foot, kitty, Alacritty, ghostty, and its version)
- **Omarchy version:** (`omarchy-version` or the version shown in `Install > About`)

## Steps to reproduce

1. …
2. …
3. …

## Terminal size

The width and height of your terminal when the bug happened (`snote --check`
prints this).

## What you expected instead

A clear description of the behaviour you expected.

## Additional context

A failing test doubles the chance of a fix — if you can include one, even
better. See `CONTRIBUTING.md` for how to submit one.
