# AI Scrum — Project Profile

<!--
  Written by `/ai-scrum:setup` (ai-scrum plugin). Safe to edit by hand — setup only
  rewrites values you confirm, and never touches your `## Notes`.

  This file holds FACTS the workflow commands need verbatim (verify commands, paths,
  branch strategy). Project RULES and architecture guardrails stay in CLAUDE.md —
  the commands read both.

  The workflow itself lives in this repository: `.claude/commands/{refine,build,sprint,
  roadmap,concept,release-check,design-review}.md` plus `.claude/agents/{deliverable-hard,
  story-review-hard,design-reviewer,design-system-author}.md`.
  Everyone who clones the repo can use it; the plugin is only needed to install or
  update those files (`/ai-scrum:setup`). Hashes of the managed copies: .claude/ai-scrum.lock
-->

ai-scrum-version: 1.0.0
project: <project name>

## Stage

How mature the project is. The gates below follow it: a prototype has no test suite, no CI and
no release pipeline yet, and the workflow does not pretend it does. Nothing changes the stage
for you — `/roadmap check` notices when the repository has outgrown it and writes the advice into
the roadmap's `## Stage` section, `/solution-architect` (tech-rules) decides, and
`/ai-scrum:setup` applies its recommendation after you confirm it.

stage: prototype <!-- prototype | mvp | stable | live -->
core-journeys: none <!-- the few user journeys that must keep working, `;`-separated, e.g. sign in; place an order; export | none -->
tech-debt-limit: 10 <!-- open tech-debt items (roadmap `## Tech debt` + stories with kind: debt) before a cleanup sprint is due -->
architect-review-every: 20 <!-- stories done since the last solution review before a new one is recommended; 0 = never by count -->
architecture-path: docs/architecture <!-- where /solution-architect writes its dated reviews -->
<!--
  stage      prototype = finding out what to build. No acceptance tests required, no e2e, no
                         release check at the end of a sprint.
             mvp       = the first usable cut. Acceptance criteria are proven by tests; still no
                         e2e and no release check — the sprint's regression gate is the gate.
             stable    = the core no longer moves much. The core journeys are proven end to end
                         (`ui-acceptance-required: core`), and every sprint ends with the release
                         check.
             live      = users get releases. Everything above, with the release lane checked as
                         a dry run (`release-plan`, `release-dry-run`).
             A profile without the key behaves as `live` — that is how every project ran before
             the key existed.
  The keys in `## Verify`, `## Release` and `## Acceptance` stay the truth for each gate; the
  stage is what setup proposes them from and what the advisor compares them against. Only one
  thing reads the stage directly: whether `/sprint` ends with `/release-check` (stable, live)
  or with `releasable: not tracked` (prototype, mvp).
  core-journeys = with `ui-acceptance-required: core`, only a criterion that touches one of
                  these journeys needs an e2e test through the real surface; every other
                  criterion is proven by `test`.
-->

## Verify

Commands the build step runs before a story may be called done. Use `none` when a
step does not exist in this project.

build: <e.g. dotnet build Solution.sln -c Debug --nologo | npm run build | none>
test: <e.g. dotnet test | npm test | pytest -q | none>
lint: <optional, e.g. npm run lint | none>
typecheck: <optional, e.g. npm run typecheck | none>
e2e: <functional tests that drive the real app, e.g. npm run test:e2e | dotnet test --filter Category=E2E | none>
<!--
  `e2e` is the acceptance gate for user-facing stories: an acceptance criterion that
  describes something the user does is proven here, through the real surface. It is a
  separate entry because it is usually slower than `test` and lives in its own suite.
  `none` means the project has no such harness yet — see `ui-acceptance-required` below
  for what the workflow then does instead.
-->

test-story: none <!-- e.g. npx vitest run --changed HEAD | npx jest --onlyChanged | pytest -q --picked | none -->
e2e-story: none <!-- e.g. npx playwright test {files} | npm run ui:flow -- {test} | dotnet test --filter "FullyQualifiedName~{test}" | pytest -q "{file}::{test}" | none -->
e2e-story-slices: 1 <!-- 1 = one call; n > 1 only when e2e-story carries {shard} and one call could exceed ten minutes — /build then runs {shard} = 1/n … n/n in sequence -->
e2e-all: none <!-- e.g. npm run ui:flows | npx playwright test --project=flows | none -->
e2e-cleanup: none <!-- e.g. taskkill /F /IM electron.exe | pkill -f electron | none — stops what a crashed or killed e2e run leaves behind; /sprint runs it before relaunching a suite. It kills your own running instance too. -->
<!--
  Narrow per story, broad per sprint. `/build` runs a story-sized gate; `/sprint` runs
  the full one once, after the last story, and bisects a red result back to a story.

  test-story = the tests affected by the story's changes. The story is not committed
               yet when /build verifies, so compare against HEAD (the uncommitted diff),
               never against the branch base. Fallback when missing or `none`: the full
               `test`, exactly as before this key existed. Whatever the command selects, every
               non-e2e test the story names in `## Acceptance Tests` must be among what
               ran; if one is not, /build runs the full `test` instead. dotnet has no
               built-in changed-file selection, so `none` is the usual value there;
               pytest needs a plugin (`pytest-picked`, `pytest-testmon`).
  e2e-story  = a TEMPLATE that runs only the e2e tests this story mapped its criteria to.
               The `## Acceptance Tests` lines name file and test, not the invocation —
               the syntax is the harness's, so it lives here, once, not in every story.
               Placeholders: `{files}` = every distinct e2e file of the story,
               space-separated, one run; `{file}` / `{test}` = one run per mapped line,
               with its file and its test name. Fallback when missing or `none`: the full
               `e2e`, as before. Ignored while `e2e` is `none`.
  e2e-story-slices = how many calls /build splits one `e2e-story` run into. 1 (the default,
               also when the key is missing) is one call. Set n > 1 and put `{shard}` into
               `e2e-story` (e.g. `--shard={shard}`) when a story's selection can take longer
               than ten minutes, the ceiling of a single tool call; /build then runs
               `{shard}` = 1/n … n/n in sequence and reads the outputs as one run. Rule of
               thumb: n = worst-case minutes of a full selection divided by 8, rounded up.
  e2e-all    = every acceptance flow, where they are a suite of their own next to `e2e`
               (e.g. `e2e` = screenshots + axe, `e2e-all` = all user flows). Runs only
               in the sprint's regression gate, never per story. `none` = `e2e` already
               covers them; do not set it to the same command as `e2e`.
-->

test-support: none <!-- e.g. tests/support/ (shared fixtures, builders, fakes) | none — pasted into every deliverable prompt by /build so agents reuse it instead of writing their own -->
e2e-quarantine: none <!-- e.g. tests/e2e/quarantine.json | none — the expected-failure list the e2e-all runner reads; /sprint's regression gate writes a pre-existing or flaky test into it -->

## Conventions

doc-language: en <!-- language for generated artifacts: stories, sprint reviews, concepts -->
requirements-path: docs/requirements
sprints-path: docs/sprints
roadmap-path: docs/ROADMAP.md
concepts-path: docs/concepts
systems-path: docs/systems
story-id-format: NNN <!-- three digits + slug, e.g. 042-npc-haggling.md -->
sprint-id-format: SNN <!-- e.g. S07 -->

changelog-path: none
<!--
  Optional. Path to a USER-FACING changelog (e.g. version.md, CHANGELOG.md) — not the
  git history. When set, /build and /sprint require an entry for every user-facing
  change; when `none`, the rule is dormant and nothing asks for it.

  The house style for such a file, if you set one:
    - one entry per user-facing feature or fix, in the open block (`changelog-style` below)
    - tests, refactors and internal changes do not appear — they change nothing for the user
    - a published section (on the release branch, or tagged) is never changed
    - short, punchy, a little funny. Not a paragraph explaining the implementation.
    - the language is `doc-language`
-->
changelog-style: unreleased <!-- unreleased | version-section — where the next release's notes go; ignored while changelog-path is none -->
<!--
  unreleased      = a Keep-a-Changelog file: notes go under `## Unreleased`, and the release
                    script promotes that heading to the new version (CHANGELOG.md with a
                    release workflow).
  version-section = every version is its own section, written by hand (`# 1.22.2` / date /
                    `# Features` / `# Fixes`, as in a version.md): notes go into the topmost
                    section while it is unpublished; once it is on the release branch, the next
                    note opens a new section above it.
-->


## Release

Whether a sprint ends releasable: `/sprint` merges the release branch in at its start and, from
stage `stable` on, runs `/release-check` as its very last step — the merge of the final commit
into the release branch, in a throwaway clone with a clean install, every blocking step of the
PR and the release pipelines (the release as a dry run), under CI conditions. Its verdict,
`releasable: yes | NO | UNVERIFIED`, heads the sprint's final report. In stage `prototype` or
`mvp` the check does not run and the verdict is `releasable: not tracked`. Run `/release-check`
yourself before opening a PR — it works in every stage.

release-branch: main <!-- the branch PRs target and releases run on, e.g. main | none -->
release-verify: auto <!-- auto | <your own command> | none -->
release-plan: none <!-- read-only, prints the next version + bump level, e.g. pwsh -File scripts/plan-release.ps1 | node scripts/release.mjs --print-plan | npx semantic-release --dry-run | none -->
release-dry-run: none <!-- the release minus commit, tag, push, publish, e.g. pwsh -File scripts/ci-release.ps1 -DryRun | node scripts/release.mjs --dry-run | none -->
commit-style: plain <!-- plain | conventional — the subjects /sprint and /build write -->
<!--
  release-branch  = where GitHub (or your CI) runs the PR checks against and the release after
                    the merge. `/sprint` merges `origin/<release-branch>` into its work branch at
                    the start and before its last check, when that is conflict-free — that is
                    how the release commit your pipeline pushes gets back. `none` = no PR target
                    and no release: the check runs the PR lane on HEAD.
  release-verify  = auto: /release-check reads the CI workflow files of the merge on every run and
                    runs every blocking step, so it cannot drift from them.
                    <command>: your own check, if you already have one that merges, runs every
                    blocking step and emulates the runner — /release-check runs it in place of
                    its own steps and still checks the merge, the notes and the bump itself.
                    none: only the short suites run, on HEAD — and the verdict is UNVERIFIED,
                    never yes.
  release-plan    = how the release decides its next version. Without it, the verdict names no
                    version and the bump is not checked.
  release-dry-run = how the release lane is checked without releasing. Without it, the release
                    step is reported as not run, and the verdict cannot be yes for a due release.
  commit-style    = conventional when your release derives the bump from Conventional-Commit
                    types (feat → minor, fix → patch): story commits become `feat(042): …`,
                    `fix(042): …`, `test(042): …` from the story's change type, bookkeeping
                    `docs(S07): …`. plain keeps `042: …` / `S07: …`, which such a script reads
                    as patch — a feature sprint then ships as a patch release.
-->


## Branching

branch-base: main <!-- the branch a sprint starts from: cut from with sprint-branch: true, committed on with false -->
sprint-branch: true <!-- true = cut a sprint branch, commit there, you merge it; false = commit every story directly on branch-base -->
sprint-branch-pattern: sprint/{id} <!-- ignored with sprint-branch: false -->
auto-commit-per-story: true <!-- /sprint commits once per story, on the sprint branch (or on branch-base with sprint-branch: false) -->
protected-branches: main <!-- never commit here, never push, never merge — except the one `SNN: sprint started` commit /sprint makes on branch-base -->
<!--
  sprint-branch: false is for a branch you work on directly, such as `dev` in a private
  project: no branch, no merge step, the sprint's commits land on branch-base as they are
  made. It requires a branch-base that is NOT in protected-branches — /sprint refuses to
  start otherwise. Change it between sprints, never while one is in-progress.
-->

## Acceptance

**Acceptance is the test suite, not a person with a click list.** Every acceptance
criterion is proven by an automated test that the workflow writes as part of the story.
A story is done when its criteria's tests pass and the clean-agent review is through —
there is no separate manual gate, no "built, acceptance pending", no user tick.
What a walk-through afterwards finds becomes a new story.

ac-tests-required: true
<!--
  true  = P1 applies: every acceptance criterion needs a named automated test before
          `status: ready` (`/refine` writes the AC → test mapping) and a passing one
          before `status: done` (`/build` re-checks it). A criterion that genuinely
          cannot be automated is declared as `manual residue` with a reason and does
          not block anything — see below.
  false = the mapping is advisory; the workflow only asks for tests where the story
          itself does. Use this for throwaway or spike projects.
-->

ui-acceptance-required: false
<!--
  true  = a criterion that describes something the USER does is proven through the
          real surface — the `e2e` command from `## Verify`. A console command, a
          direct call into an internal module, or a renderer test with a faked
          backend does not count as a substitute for the real path. Criteria without
          a surface (core logic, IPC, parsing) are covered by `test`.
          If `e2e` is `none`, the harness does not exist yet: `/refine` then plans it
          as the story's first deliverable, or, when that is out of scope, covers the
          criterion at the next level down AND names the gap in the story and the
          sprint review. It never quietly becomes a manual step.
  core  = as `true`, but only for criteria that touch one of the profile's `core-journeys`;
          every other user-facing criterion is proven by `test` and is not a gap. With
          `core-journeys: none` this behaves as `false`. The usual value from stage `stable` on.
  false = for a library, CLI, mod or service without a user-facing surface, and for a
          prototype or an mvp, where the journeys still change every sprint.
-->

manual-residue-allowed: true
<!--
  true  = a criterion that cannot be automated for a real reason (an OS signature
          dialog, a specific piece of hardware, an external paid service) is marked
          in the story as `manual residue: <reason>`. It is listed in the sprint
          review and, if the project generates one, in `testplan.md` — the only
          things left that anyone walks by hand. It does NOT hold the story or the
          sprint open.
  false = such a criterion has to be reformulated or dropped in refine.
-->

testplan: optional
<!--
  optional = `/sprint` writes `testplan.md` only for the criteria marked
             `manual residue`, and skips the file entirely when there are none.
  required = always write the full step-by-step plan (the old behaviour).
  off      = never write it.
  In no case is `testplan.md` an acceptance gate — the tests are.
-->

## Design

Where the project's design system lives and how drift from it is found. `/refine` plans
every deliverable that changes what the user sees from it, `/build` hands it to those
deliverables and runs the scan in its narrow gate, and the code review checks the diff against it.

design-system: none <!-- e.g. docs/design/README.md | none -->
design-scan: none <!-- e.g. npx tsx tools/ui/design-scan.ts {files} | npm run lint:design -- {files} | none -->
<!--
  design-system = the design document: tokens, components (and which one serves which need),
                  screen archetypes with their reference, states, voice. `none` in a project with
                  a user-facing surface means UI is built without one: `/refine` then raises it as
                  an open question (start one first, see the tech-rules skill `design-system`, or
                  build this story without one and name the gap) instead of letting every story
                  invent its own look.
  design-scan   = a command that reports design-system breaks (literal colours and sizes, own
                  control styles, native controls, browser dialogs, raw rich text) in the files
                  given as {files}, one hit per line with its `file:line`. `/build` runs it on the
                  UI files a story changed: a hit on a changed or added line is red, a hit on an
                  untouched line of a touched file is listed, not blocking.
-->

## Context to read before coding

Files every implementation and review agent must read before touching code.
Keep this short — it is pasted into every subagent prompt.

- CLAUDE.md
- <e.g. .claude/skills/csharp-conventions/SKILL.md>

## Notes

<!-- Free text. Never overwritten by setup/update. Project quirks worth knowing. -->
