# Changelog — ai-scrum

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->

## 2.1.1 — 2026-08-20

### Fixed

- **Progress trail timestamps were invented, not read.** `/sprint` told the build agent to
  append `<YYYY-MM-DD HH:MM>` to `progress.md` without saying how to get that value, so the
  agent guessed — off by hours in practice. It now must run `date` (or `Get-Date`) and use that
  output instead of estimating, and it logs a `started` line right before delegating each
  deliverable in addition to the `done`/`blocked` line after, so `progress.md` also shows how
  long each deliverable actually took.

## 2.1.0 — 2026-08-19

### Added

- **`progress.md` per sprint.** The build agent appends one line per finished deliverable to
  `<sprints>/SNN/progress.md`, and the sprints README says to watch it. A sprint runs for hours
  and is otherwise indistinguishable from a dead one in the working tree — which is exactly how a
  stuck agent used to go unnoticed for an hour or more.

### Fixed

- **Builds no longer hang silently.** `/build` delegated with "no `run_in_background`" back when
  foreground was the default; today an omitted flag means *background*, and a background child
  never wakes its caller — completion notifications reach the top-level session only, never a
  subagent. So the build agent would end a turn with "waiting for D2 and D3", which is not a pause
  but its final answer, and the story stopped there. Every `Agent` call in `/build`, `/sprint`,
  `/refine` and `/concept` now spells out `run_in_background: false`, and a new
  `## Delegation rules` section in `/build` states the three consequences: never background a
  child, never end a turn with "waiting", and parallelism is several foreground calls in ONE
  message (which run concurrently *and* block) — never background plus polling. Measured over five
  real sprints: 71 idle turns, 1765 minutes of dead time, one of them 111 minutes after all three
  children had already finished.
- **No more improvised watchdogs.** `/sprint` now states that `ScheduleWakeup` is rejected outside
  `/loop` mode and `TaskOutput` cannot resolve a subagent id — both fail with an error instead of
  protecting the run. Orchestrators had started answering that by spawning dummy `noop` agents just
  to wake themselves, then mistook the dummy's completion for the real build's.
- **A failed agent is no longer treated as a finished one.** Reports that come back empty, say
  "terminated early" or name an API error (`529 Overloaded`) mean nothing was delivered: `/build`
  now inspects the working tree for partial edits and re-dispatches that deliverable once.

### Changed

- **The agent tier is pinned, never inherited.** An `Agent` call without `model` does not take the
  command's frontmatter — it takes the *session* model and hands it down its whole subtree, so a
  session switched to Opus mid-run silently re-tiers every agent below it at roughly five times the
  price. Default-tier deliverables, story builds, test-plan writing and `Explore` research now pass
  `model: "sonnet"` explicitly; the hard tier stays exactly where `## Model Hints` puts it. Across
  the five sprints that were measured, Opus was 46% of the turns and 76% of the bill, and the same
  sprint shape cost ~$255 per story with an inherited Opus tree against ~$63 with a pinned default.
  `/sprint` also tells the user not to switch the session model mid-sprint.
- **Agent reports are capped.** Deliverable agents return at most 10 lines, story builds at most 20,
  reviewers return `file:line` pointers instead of pasted code — because everything an agent returns
  stays in its caller's context and is re-read on every turn it has left. The same reasoning is now
  spelled out for the orchestrators themselves: `/build` and `/sprint` delegate reading instead of
  opening source files, and each verify command runs once rather than being repeated on an untouched
  tree. The eight longest-lived agents grew to 250k-460k context and accounted for 29% of all cached
  input over two days.

## 2.0.1 — 2026-08-18

### Added

- **`/concept` document format is sharper.** Scope is now three lists instead of one: in-scope for
  v1, deliberately-not-in-v1 *with the rationale for the deferral*, and permanent non-goals with
  their reason — a permanent no that is written down stops being re-proposed every few months. The
  decision table gained a rationale column, and a `Tech decisions` table (area / choice / rationale)
  is written where a concept fixes technology, omitted where it adds nothing to the stack.
- **Open points are resolved inline.** When the user answers one during the review loop, the answer
  goes into the section it belongs to and the item leaves the list, instead of the document carrying
  two truths. The list shrinking to nothing is what a decided concept looks like.
- **`/ai-scrum:setup` checks `.gitignore` in both directions** and reports both lists, in `check`
  mode too, without ever editing the file. Ignored-but-must-not-be was already covered for
  `.claude/`; the new direction is generated data that is *not* ignored — build output, dependency
  folders, test and screenshot artefacts, seeded fixture and demo-data folders, `.env*`, per-user
  editor state — each named with the line that would cover it.
- **Optional `changelog-path` profile knob** for a user-facing changelog (`version.md`,
  `CHANGELOG.md`). When set, `/build` requires an entry per user-facing feature or fix under
  `# Features` / `# Fixes` of the current version section, and `/sprint` sweeps the sprint for
  missing ones and records a late addition in the review. House style is documented in the profile
  template: appended only, short, punchy, a little funny, in `doc-language`, no entries for tests or
  refactors. Default `none` keeps the rule dormant.

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
