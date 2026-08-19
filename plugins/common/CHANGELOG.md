# Changelog — common

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

## 1.0.1 — 2026-08-18

### Changed

- The **karpathy** skill moved to the `tech-rules` plugin, which installs it into a repository as a
  project skill. It never shipped in a released version of `common`, so nothing to migrate: the
  rules are the same text, they just arrive via `/tech-rules:setup` now and therefore also reach
  contributors who have no plugin installed.

### Added

- Command **`/common:premortem`** (`commands/premortem.md`) — assume the plan has failed, work
  backward to causes, early warning signs, preventions and owners. Starts by reading the actual
  plan and checking it against the repository, so the failure causes are evidence and not filler.
- Command **`/common:secrets-scan`** (`commands/secrets-scan.md`) — scan staged changes (default),
  the working tree, history or a path for literal credentials, secrets in the wrong file class,
  tokens leaking through loggers and missing `.gitignore` coverage. States rotation as step 1 of
  every fix, because a pushed secret is compromised.

## 1.0.0 — 2026-08-13

First release. A home for building blocks that are useful in every project and do not belong
to a workflow plugin.

### Added

- Output style **Briefing** (`output-styles/briefing.md`) — ~10-line briefing shape (subject,
  findings, how to proceed), paths instead of file dumps, and full step-by-step precision when
  the user has to run something. Answers in German.
- Output style **KIS** (`output-styles/kis.md`) — plain words, short sentences, at most two
  options per decision.
- Both keep `keep-coding-instructions: true`, so they change the voice and not how code is
  written, and neither sets `force-for-plugin` — the user picks the style in `/config`.
