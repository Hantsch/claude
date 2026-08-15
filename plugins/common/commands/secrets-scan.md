---
description: Scan staged changes, working tree or history for committed credentials, connection strings and secrets that leak through logs.
argument-hint: [staged | tree | history | <path>]  (default: staged)
---

# Secrets scan

Find credentials that are about to be committed, are already committed, or are being written to
a log. This is a targeted scan, not a full security review - for injection, authz and input
validation use the built-in `/security-review`.

## Scope

`$ARGUMENTS` selects what to look at; default to `staged`.

| Argument | What to scan |
| --- | --- |
| `staged` | `git diff --cached` - use this before committing |
| `tree` | every tracked, non-ignored file in the working tree |
| `history` | `git log -p` for the added lines across all commits (slow; say so before starting) |
| a path | that file or directory only |

Skip `.git/`, lock files, `node_modules/`, build output and binaries. Do not skip `.env.example`,
CI workflows, `appsettings*.json`, `docker-compose*.yml` or test fixtures - those are where
real secrets actually turn up.

## What counts as a finding

1. **Literal credentials** - passwords, API keys, tokens, private keys, connection strings with
   an inline password (`mongodb://user:pw@`, `Server=...;Password=...`), basic-auth URLs,
   `-----BEGIN ... PRIVATE KEY-----`, cloud keys (`AKIA...`, `ghp_...`, `sk-...`, `xox[baprs]-`),
   JWTs with a real payload.
2. **Secrets in the wrong file class** - a real value in `.env.example`, in a committed
   `appsettings.Development.json`, in a comment, or hardcoded as a "temporary" default.
3. **Secrets that leak through output** - a token, password, cookie, authorization header or
   whole request/response object passed to a logger, `Console.WriteLine`, `console.log`, an
   exception message, a crash reporter or telemetry. Check that redaction, where it exists, runs
   before the log call and not after.
4. **Missing ignores** - a file that holds real secrets by design (`.env`, `secrets.json`,
   `*.pfx`, local database files) and is tracked or not covered by `.gitignore`.

Distinguish a real value from a placeholder by shape, not by name: `Password=changeme` is a
placeholder, `Password=Xk93!qLm2` is not. When you cannot tell, report it as uncertain rather
than dropping it.

## Report

For each finding, one block:

- **Where** - `path:line`
- **What** - the kind of secret, with at most the first four characters quoted, never the value
- **Blast radius** - what an attacker can reach with it
- **Fix** - move to environment/secret store, and the concrete call to redact if it is a log leak

Order by blast radius. End with a one-line verdict: safe to commit, or not.

## The rule that matters

**A secret that reached a commit is compromised and must be rotated.** Deleting the line, amending
the commit or rewriting history does not undo the exposure - assume the value is public from the
moment it was pushed. Say this explicitly for every finding in `history` scope, and name the
rotation as step 1 of the fix, before the code change.
