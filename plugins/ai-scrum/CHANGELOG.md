# Changelog — ai-scrum

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

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
