# Contributing to snote

Thank you for your interest in contributing!

## Reporting a bug

If you find a bug, please run:

```
snote --report
```

This creates a report file at a path under `$XDG_STATE_HOME/snote/report-<timestamp>.json` (or `~/.local/state/snote/report-<timestamp>.json` if `$XDG_STATE_HOME` is not set).

attach the report-*.json file it prints to your issue so we can quickly reproduce the problem.

## Writing a good issue

A good issue makes it easy for us to fix the problem. Please include:

- **steps to reproduce**: what you did, in order
- **terminal size**: the width and height of your terminal
- **what you expected instead**: the behaviour you were expecting

a failing test doubles the chance of a fix, so if you can provide one along with your issue, even better.

The more detail you provide, the faster we can help.

## Pull requests

We welcome pull requests. To start one, use:

```
gh pr create
```

If you have a coding agent that can fix the bug for you, see `AGENTS.md` for how to proceed.

A failing test doubles the chance of a fix, so if you can write one along with your PR, even better.
