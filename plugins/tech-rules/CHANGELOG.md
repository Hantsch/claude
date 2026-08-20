# Changelog — tech-rules

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

### Changed

- **`ui-verify`** now writes down the session model it was silent about: one app session per fixture
  variant, `page.reload()` between screens, a fresh app only for a screen whose subject is the cold
  boot (`coldStart: true`) or after a crash. Two implementations of this skill read it in opposite
  ways - 56 launches and two minutes of stolen focus versus 2 launches and under 30 seconds, with
  identical evidence.
- **`ui-verify`**: a run must not take the keyboard focus. `window.show()` activates from the main
  process on `ready-to-show`, so the app has to offer `showInactive()` under the verification flag
  the harness already sets - the harness cannot fix this from outside.
- **`ui-verify`**: relaunching does not reset the fixture, it re-reads it. State resets come from
  rewriting the fixture, which is now required at the start of every run instead of only when the
  fixture is missing.
- **`ui-verify`**: screenshot and axe must come from the same visit to a screen, and console output
  must be attributed per screen rather than per session. Plus the exit-code contract (0 clean, 1
  harness or app failure, 2 accessibility findings), a flow API for scripting a story's own
  acceptance steps, a screen filter for the fast edit/verify loop, and the fixture's duty to switch
  off boot-time side effects that reach outside it (a scan of the real system, a network call).
- **`ui-verify`**: two absolutes softened into conditions - content in every shipped language only
  applies when the UI ships more than one, and the numeric a11y floor read from the stylesheet only
  when the project has such a token. A mouse-driven desktop app has no tap-target floor, and
  inventing one in the harness is a design decision the harness does not own.

## 1.0.0 — 2026-08-18

First release. The house rules stop being a plugin you have to install and become part of the
repository they apply to, so a contributor who never installed anything still gets them.

### Added

- Command **`/tech-rules:setup`** (`commands/setup.md`) — detects the stack, installs the matching
  rule groups as project skills in `.claude/skills/`, writes `.claude/tech-rules.lock` (version,
  groups, `git hash-object` per file), and maintains a marked pointer block in `CLAUDE.md` after an
  explicit yes. `check` reports without writing. An untouched copy is overwritten on update, an
  edited one is diffed and asked about, a kept one is recorded as `local`, and a group whose stack
  disappeared is only deleted after a question.
- **Rule payload** under `templates/skills/<group>/` — group `all`: `karpathy`; `dotnet`:
  `backend-guidelines`, `composition-root`, `csharp-unittest`, `dotnet-review`; `react`:
  `frontend-guidelines`, `design-tokens`; `electron`: `electron-arch`, `typed-ipc`, `ui-verify`.
  Content unchanged from the retired `react`, `dotnet`, `electron` and `common` plugins; only the
  managed marker was added and the two references to the one-time files were rewritten, because a
  `${CLAUDE_PLUGIN_ROOT}` path does not resolve once a file lives in a project.
- **`dotnet-review`** — the former `/dotnet:review` command as a skill (`disable-model-invocation`,
  so it still only runs when invoked), reading the rules from `.claude/skills/` instead of from the
  plugin.
- **One-time files** `templates/oneshot/launch.js` and `templates/oneshot/json-store.ts` — offered
  for an Electron project when the target is missing, then user-owned forever, with no marker and
  no lock entry.
- Selective install by detected group, on purpose: skill descriptions sit in every session's
  context and are truncated when the listing overflows, which would strip the trigger sentences the
  rules are matched on.
- Setup reports the three silent failure modes: a project skill or command of the same name, a
  personal `~/.claude/skills/<name>/` copy that shadows the project one, and an old per-stack
  plugin still installed and duplicating every rule.
