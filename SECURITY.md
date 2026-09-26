# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub security advisories on
[donnishcomau/snote](https://github.com/donnishcomau/snote/security/advisories/new).
Do not open a public issue for a security problem.

## Scope

The security surface of snote is:

- the Simperium sync client (wire protocol handling and reconnects),
- token storage (on-disk credentials and their file permissions),
- terminal rendering of server-supplied text (note content, tags, and any
  other strings that originate from the sync server).
