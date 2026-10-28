# Changelog — scrum-cockpit

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

## 1.0.0 — 2026-10-28

- First release. A band above the prompt with the current milestone, the sprint and its story
  count, the running subagents, and an update hint when the project's ai-scrum or tech-rules copy
  is older than the installed plugin (with a button that runs its setup) or the plugin is older
  than the marketplace.
- `/scrum` opens a pane: versions, "Where we stand", milestones (unplanned ones with a
  `/roadmap plan` button), the sprint with its stories, deliverable counts and last trail line
  (start or resume button), stories in no sprint (refine or build button), open topics and
  follow-ups.
- Live subagents: type, task, model and effort, run time and the tool call they are on; a running
  one opens its transcript on press.
- Buttons run the project's own commands as if typed, so model and effort come from the command's
  frontmatter; the label shows them.
- Reads the template layout and the drift seen in real projects: milestone ids like `11.5`, an
  `accepted` status, a roadmap row that lags its running sprint, and the pre-4.0 roadmap with one
  `### M5 — …` heading per milestone.
