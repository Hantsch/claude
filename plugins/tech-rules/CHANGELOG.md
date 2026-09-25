# Changelog — tech-rules

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

## 2.0.1 — 2026-09-25

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

### Fixed

- **`backend-guidelines`: the module registration class is `public`, not `internal`.** It is called
  from the `*.Api` host, a different assembly, so the sample as written did not compile (CS0122).
  The same section and `composition-root`'s entry-file example no longer route `AddControllers()`
  through an `ApiBootstrap` helper, which broke the skill's own inline-framework-call and
  `<Concern><Role>` naming rules.
- **`typed-ipc`: the compile-time channel-completeness check could never fail.** `never` is
  assignable to everything, so `undefined as never` satisfied any declared type. The assertion now
  assigns to `never`, and the error names the missing channel.
- **`electron-arch`: `assertInside` rejects a target on another drive.** On Windows `path.relative`
  returns the absolute target when root and target share no prefix, so a renderer-supplied
  `D:\...` path passed containment. The check is now exact (`..`, `..<sep>...` or an absolute
  result) and no longer rejects a child literally named `..name`.
- **`json-store.ts` no longer treats an unreadable state file as absent.** A locked or
  permission-denied file made `load()` return defaults, and the next write replaced the user's
  data; `load()` now rejects on anything but `ENOENT`. One-time file: an existing copy in a project
  needs the three-line patch by hand.
- **`launch.js` no longer triggers Node's DEP0190 deprecation warning** on every `npm run dev` on
  Windows with Node 24 or later: the Windows branch passes one quoted command string to the shell
  instead of an args array. One-time file: apply the same change by hand to an existing copy.
- **`design-tokens`:** the iOS auto-zoom snippet referenced an undefined `--fs-base` token, so the
  16px floor did nothing; now `max(1rem, 16px)`.
- **`frontend-guidelines`:** the no-default-exports rule names the tool-required exceptions (CSF
  story `meta`, config files) and shows the `React.lazy` named-export shim, so it no longer
  contradicts the story and lazy-route steps in the same skill. `PageHeader` was listed as both an
  organism example and a mandatory molecule; the layer map now uses `Sidebar` as the organism
  example.
- **`csharp-unittest`:** the test template no longer uses the abbreviated local `repo`, which
  `backend-guidelines` forbids and `/dotnet-review` flags.
- **`dotnet-review`** no longer hardcodes repo-root paths to its sibling rules, which did not exist
  when the dotnet group was installed nested; and `branch` takes an optional base
  (`/dotnet-review branch dev`), because diffing against the default branch on a project that
  integrates via `dev` reported everyone's unmerged work as the branch's own violations.
- **`ui-verify`:** Shape, script list, Flows and Procedure now name the `test:e2e` run and
  `flows/<name>.mjs` that the 2.0.0 intro already required; `test:e2e` runs every flow, a story runs
  its own by name.
- **`karpathy`:** the closing section pointed at the `common` plugin, which has not shipped the
  skill since it moved into this payload; it now names `.claude/skills/karpathy/SKILL.md` and the
  managed `CLAUDE.md` block.
- **`/tech-rules:setup`:** offers the one-time files on an update too when the target is missing —
  an installed `electron-arch`/`ui-verify` skill sent users to setup for them, and setup refused on
  every run after the first. The lock's `groups` is now the default group set on an update: a
  declined group is offered again as an addition but never installed unasked, and a kept orphan
  stays recorded. A `local` file or a kept orphan is re-asked about only when the plugin version
  changed. A group with a user-invoked skill stays at the repo root (a nested `/dotnet-review` is
  not invocable until Claude has touched that subtree), and a `package.json` with `react-native` or
  `expo` is a *looks wrong* case for the `react` group rather than a detection.
- README: the skill table says what a skill *covers*, not what it enforces; the install block names
  the marketplace step; the `local` wording matches setup.

## 2.0.0 — 2026-09-07

### Changed

- **`ui-verify` no longer sells a screenshot as acceptance.** It pointed at ai-scrum's retired
  `live-smoke-required` / `live-smoke-how` flags and answered them with `npm run shot`. A PNG
  proves that a screen renders; it cannot fail an acceptance criterion. The skill now names the
  same harness as the base for a functional Playwright suite (`npm run test:e2e` — same app start,
  same scrubbed env, same seeded fixture) and points at ai-scrum's `ui-acceptance-required` plus
  its `e2e` profile entry. Trigger list extended to functional/e2e tests driving a real Electron
  UI.

## 1.1.0 — 2026-08-20

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
  Content unchanged from the retired `react`, `dotnet` and `electron` plugins and from `common`,
  whose `karpathy` skill moved here; only the
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
