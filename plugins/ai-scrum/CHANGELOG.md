# Changelog — ai-scrum

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

## 2.0.0 — 2026-08-13

The workflow now lives in the consuming repository instead of the plugin. A project that has
run setup works for everyone who clones it — no marketplace, no plugin, no install step. The
plugin is only needed to put those files there and to update them.

### Changed (breaking)

- **The plugin ships one command: `/ai-scrum:setup`.** `refine`, `build`, `sprint`, `roadmap`
  and `concept` are no longer plugin commands; they are payload under
  `templates/workflow/` that setup copies into `.claude/commands/`. In a project they are
  called **without the namespace**: `/refine 042`, `/build 042`, `/sprint S03`.
- The two agents `deliverable-hard` and `story-review-hard` move the same way, into
  `.claude/agents/`. Their names are unchanged, so `subagent_type` markings in existing
  stories keep working.
- **After updating, run `/ai-scrum:setup` once per project** — otherwise the workflow commands
  are gone with the old plugin version.

### Added

- Setup installs and updates the workflow files, and records version plus a `git hash-object`
  hash per file in `.claude/ai-scrum.lock`. On the next update an untouched copy is replaced
  silently, an edited one is diffed and you are asked before it is replaced.
- Every installed file carries an `<!-- ai-scrum:managed <version> -->` marker, so its origin
  is obvious in the project.
- Setup warns when `.claude/` is git-ignored, which would keep the workflow from reaching the
  rest of the team, and reminds you to commit what it wrote.
- `scripts/validate.ps1` validates the workflow payload like real commands and agents
  (frontmatter, agent name = file name) and rejects a payload file that uses
  `${CLAUDE_PLUGIN_ROOT}` or lacks the managed marker.

### Removed

- The migration step that deleted pre-plugin file copies of the workflow. Those files now sit
  at the same paths setup writes to, so they are handled by the diff-and-ask path instead.

## 1.0.1 — 2026-08-12

Cost and correctness pass, derived from measuring a real 15-deliverable build session
(21 agents, 139M tokens). Two thirds of that bill were cache reads — context re-read on every
agent turn — and the most expensive agent of the run existed only to repair an acceptance
criterion that had never become a deliverable.

### Added

- **Coverage gate in `/ai-scrum:refine`** (new step 5): every acceptance criterion must be
  covered by at least one deliverable before `status: ready`. An uncovered criterion is
  invisible during the build — all Ds tick green — and only surfaces in the final code review,
  where the repair cycle costs more than the implementation agents together.
- `/ai-scrum:build` re-checks the same coverage as a precondition and sends the story back to
  refine instead of building around the gap.

### Changed

- `/ai-scrum:refine`: deliverables now name the files they touch, plus the file to mirror
  where they follow an existing pattern. Added a size cap — a D over ~8 files, or spanning
  more than one layer, gets split (two agents at 30 turns cost less than one at 65).
- `/ai-scrum:build`: the implementing agent is told to start from those files instead of
  surveying the repo, and now records which files each D changed.
- `/ai-scrum:build`: the code reviewer receives that deliverable → changed-files mapping, so
  it goes straight to the relevant code instead of rediscovering it from the diff.
- `deliverable-hard`: same start-from-the-named-files binding — thinking the named risk
  through is what the tier is for, re-deriving the file layout is not.
- Story template: deliverables carry their files, and the coverage rule is stated where the
  deliverables are written.

## 1.0.0 — 2026-08-04

First release. Extracted from the Hantsch-MMO project's `.claude/` setup and generalised so it
can be used and updated across projects.

### Added

- Commands `setup`, `refine`, `build`, `sprint`, `roadmap`, `concept`.
- Agents `deliverable-hard` and `story-review-hard` (Opus + high effort, opt-in per deliverable
  via `## Model Hints`).
- Project profile `.claude/ai-scrum.md` — verify commands, paths, branching, acceptance policy,
  doc language, context files. Written by `/ai-scrum:setup` with auto-detection for .NET, Node,
  Python, Rust, Go and Factorio-mod projects.
- Project templates: story, sprint, roadmap, docs index, requirements/sprints workflow READMEs,
  story history index.
- `/ai-scrum:setup check` — report-only mode.
- Migration of pre-plugin file copies (`.claude/commands/{refine,build,sprint,roadmap,concept}.md`
  and the two agent files), with confirmation before deletion.

### Changed from the original project setup

- All process files are English; artifacts are written in the project's `doc-language`
  (default `en`).
- Project-specific details that used to be hardcoded (solution name, build command, engine MCP,
  frozen client path, determinism rules, skill names) now come from the profile and `CLAUDE.md`.
- The P1 (UI acceptance) and P2 (live smoke) rules became profile switches instead of always-on
  rules.
- Commands are namespaced: `/ai-scrum:refine` instead of `/refine`.
