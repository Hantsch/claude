# Changelog — scrum-cockpit

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

## 1.3.0 — 2026-10-30

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->
- **The cockpit follows a sprint to its end.** Phase 4 of `/sprint` (roadmap check, release
  check) runs after the sprint is archived and marked done; the cockpit now reads it from
  `.git/ai-scrum/trail.md` (ai-scrum 4.10) and keeps the sprint in focus with a new **Release**
  step: the running check, its start and the log to watch, and a Resume button when it stopped.
- **The release verdict and its record.** A Releasable card shows the last
  `releasable: yes | NO | UNVERIFIED` line in green, red or amber, and the record from
  `.git/ai-scrum/release-checks.jsonl` (`record: 3 green cycles in a row · 1 missed`). A missed
  verdict — yes, then GitHub went red — is shown in amber, in the band too.
- **A Release check button** runs `/release-check` with its own model and effort; hidden while a
  check runs.
- **Settings show the profile's `## Release` keys** (read-only), and point at `/ai-scrum:setup`
  when the profile has none.

## 1.2.0 — 2026-10-29

- The sprint card with its story chips now sits above the build card. The build card's story title
  unfolds on a click to the story's requirement and acceptance criteria.

- A settings pane (`/scrum settings`, or **Settings** in the pane) shows and changes the profile's
  branching: base branch, sprint branch or direct commits on the base (ai-scrum's new
  `sprint-branch`), the sprint branch's name, commit per story and the protected branches. It is
  the cockpit's only write, one profile line at a time, and locked while a sprint runs. The
  heading card shows the branching in one line.

## 1.1.0 — 2026-10-28

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

- The pane is now a stack of cards that follows the sprint's phase. A heading card shows the phase,
  the current milestone, a step bar (Clarify, Refine, Build, Gate, Review) and the sprint's progress,
  as a ring where the surface can draw one.
- During refinement the stories still refining come first, each with its agent's run time and current
  tool call, at most eight rows, then a count. Refined stories shrink to a list of ids. Agents are
  counted, with the longest-running one named.
- During the build one story is in focus: its deliverables, then verify and review, with the current
  step outlined and its start time. Below it are the agents working on it as a tree (the builder and
  the agent it spawned), and the age of the last trail line. The rest of the sprint is a row of story
  chips with an estimate of the time left.
- An agent with no tool call for three minutes is marked quiet, and a trail silent for fifteen
  minutes turns amber.
- "Waiting on …" lines from the roadmap's "Where we stand" get a card of their own.
- The band names the phase and the focus story's step (`S14 Build 4/12 · 026 D4/5`).
- Phase, focus story and step are read from the sprint's `progress.md` trail, whose line format
  ai-scrum's `sprint.md` and `build.md` fix. An agent is matched to a story by the id in its
  description or prompt, or by the agent that spawned it.

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
