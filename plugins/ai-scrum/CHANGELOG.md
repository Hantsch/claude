# Changelog — ai-scrum

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

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
