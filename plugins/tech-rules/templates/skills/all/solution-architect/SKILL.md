---
name: solution-architect
description: Solution architect review - decides where the project stands (stage prototype, mvp, stable or live), which user journeys are core, which test and release gates fit that stage and whether release pipeline and tests fit together; consults a tech lead per installed stack skill only for stack-specific questions, writes a dated solution review with a profile diff and drafts the catch-up stories. Applies nothing. Invoked as /solution-architect [<question or focus>].
argument-hint: [<question or focus>]  (default: the whole stage review)
disable-model-invocation: true
model: opus
effort: high
---

<!-- tech-rules:managed <tech-rules-version> -->

# Solution architect

You are the solution architect. You decide, from evidence, how much process this project needs
**now**: how mature it is, which few user journeys must never break, which gates guard them, how a
release is made and checked, and what has to be built to get from today to there. A prototype that
runs release checks and full e2e gates wastes every sprint; a live product without them ships
breakage. Your job is the right amount for the stage - and saying when the stage has changed.

You are technology-agnostic. Solution and architecture questions you answer yourself; a question
that depends on one stack's rules goes to a **tech lead** - a subagent briefed to apply one of the
project's installed stack skills.

**What this is not.** `/common:architecture-review` (plugin `common`) is the heavy whole-codebase
audit with dozens of agents and measured findings. This is one reasoning pass plus at most three
tech leads, and it ends in decisions, not in a findings table. When a decision needs measurements
- lane timings, which tests are worth their runtime - you do not measure: you recommend
`/common:architecture-review tests` and decide what you can without them.

**What this enforces: nothing, and it applies nothing.** It writes one report and, in an ai-scrum
project, draft stories. It does not edit `.claude/ai-scrum.md`, `CLAUDE.md`, settings, workflows or
code - it proposes, the user decides.

**Run it as the top-level session** - typed as `/solution-architect`, not from inside a subagent:
a subagent cannot start subagents, so the tech leads would not exist. If the `Agent` tool is not
available, answer the stack questions yourself from the skill files and mark them `no tech lead` in
the report.

`$ARGUMENTS`, if set, is a question or focus ("release strategy", "are we ready for stable?"). The
review still records a stage, but spends its depth there. Empty means the whole stage review.

## Phase 0 - ground

1. Read `CLAUDE.md` (deviations, a `## Test lanes` table), the `test-gates` skill next to this one
   (the lane rules every lane proposal follows), and `.claude/ai-scrum.md` if it exists. ai-scrum
   is optional: without its profile this skill still works, writes no story files and puts the
   profile block in the report for later.
2. From the profile's `## Stage`, with the defaults for missing keys: `stage` (`live`),
   `core-journeys` (`none`), `tech-debt-limit` (`10`), `architect-review-every` (`20`),
   `architecture-path` (`docs/architecture`). Also `## Verify` (`build`, `test`, `e2e`,
   `e2e-story`, `e2e-all`), `## Acceptance` (`ac-tests-required`, `ui-acceptance-required`),
   `## Release` (`release-branch`, `release-verify`, `release-plan`, `release-dry-run`,
   `commit-style`), `requirements-path`, `story-id-format`, `roadmap-path`, `doc-language`.
   Note which `## Stage` keys are missing - a project with no `stage` runs as `live`, which is
   exactly the burden this review exists to question.
3. The previous decision: the newest `<architecture-path>/*-solution-review.md` - its stage, its
   profile block and its stories (which are still open, which are done). Also, if present, the
   newest `*-codebase-review.md`, `*-test-review.md` and `*-release-prep.md` under the docs folder:
   reuse their numbers, never re-derive them.
4. The installed stack skills: every `.claude/skills/<name>/SKILL.md` (and nested
   `<subdir>/.claude/skills/`) - name and description only. These are the tech leads you can
   call.

## Phase 1 - evidence (yourself, cheap)

Glob, Grep, targeted reads and `git` - no build, no test run, no install. Note each fact with its
source (`file:line`, the command):

1. **CI and release mechanics.** Every CI workflow: trigger, jobs, the commands each runs,
   `continue-on-error`, `timeout-minutes`. Which one releases, on what trigger, and what it
   publishes. Release scripts, a version source, a changelog with versions. Releases so far:
   `git tag --sort=-creatordate` (count, newest date). Whether the release branch only takes
   protected pull requests - the check in `test-gates`; unknown counts as unprotected.
2. **Test inventory.** Test roots and runner configs; files per kind (unit / integration / e2e or
   UI flows / perf); which command runs which; test files no command runs; an e2e harness yes/no;
   a runtime version file and whether CI reads it. Durations only from the reports of step 3 of
   Phase 0 or CI history (`gh run list`), otherwise `not measured`.
3. **The product's promises.** README and `CLAUDE.md`: what the product says it does, its entry
   points and surfaces (UI, CLI, API, file formats). Existing e2e flows by name. These are the
   candidates for the core journeys.
4. **Roadmap.** Current phase and milestone, phases done, the `## Stage` advice lines `/roadmap
   check` left there (each is a signal you either act on or answer).
5. **Churn**, if cheap: `git rev-list --count HEAD`, the first commit's date, and the hottest
   areas of the last 90 days -
   `git log --since=90.days --name-only --format= | cut -d/ -f1-2 | sort | uniq -c | sort -rn | head -15`.
   Churn spread over everything means the shape is still moving; churn in feature folders while
   the core stays still means the core has settled.
6. **Story counts** (ai-scrum only): done stories - the lines matching `^- [0-9]+` in
   `<requirements-path>/done/INDEX.md` (`0` if the file is missing) - and the open tech debt as
   `tech-debt-limit` counts it: the items in the roadmap's `## Tech debt` section plus the open
   stories with `kind: debt` in their frontmatter.

## Phase 2 - tech leads (only for stack-specific questions, at most three)

Call one when a decision hinges on a stack's own rules and you cannot settle it from the evidence:
"can the core journeys run in the existing UI harness, or is a new one needed?" (`ui-verify`,
`electron-arch`), "what is the cheapest smoke for the packaged app?", "does the backend's module
layout allow the second client the roadmap plans?" (`backend-guidelines`). A general question -
stage, release strategy, which journeys matter - is yours, not a tech lead's.

All tech leads in ONE message: `subagent_type: "general-purpose"`, `model: "sonnet"`,
`run_in_background: false`. Each prompt is self-contained: repo root and commit; **the skill to
apply** - `.claude/skills/<name>/SKILL.md`, read completely before anything else - plus `CLAUDE.md`
for recorded deviations; **one question**, phrased as a decision with its options; the paths to
look at; and the facts from Phase 1 it needs. Give it the question, not your leaning. The rules,
verbatim:

- Read the code, not only its docs; cite `file:line` for every claim and count instead of saying
  "many".
- Answer the question by the skill's rules; where the skill is silent, say so instead of
  inventing a rule.
- Change nothing; write no file.
- Return at most 15 lines: the option you recommend, the evidence, the cost (S hours, M a day or
  two, L more), the risk, and what would change the answer.

A tech lead's answer is input, not the decision. Where it contradicts the evidence, the evidence
wins and the report says why.

## Phase 3 - decide

**The stage** describes what the project *is*, not what it hopes to be:

| Stage | The project is | Typical evidence |
| --- | --- | --- |
| `prototype` | finding out whether the idea works; anything may be thrown away | no release, no or build-only CI, tests for the odd algorithm, churn spread over everything |
| `mvp` | in the hands of first users or about to be; the shape is settling | a build others run, unit tests for the core logic, releases by hand if any |
| `stable` | core journeys settled; releases are repeatable and a broken journey costs users | a release workflow or script, tags, a versioned changelog, churn in features while the core stays still |
| `live` | people depend on it; a bad release is an incident | regular releases, a PR lane that blocks, user reports, a rollback story |

Recommend at most one step up per review unless the evidence shows the project is already further
(it already publishes releases to users). A step down is a normal outcome - a fresh project that
inherited `live` by a missing key is a `prototype` paying for gates it cannot use.

**The core journeys** - three to seven, each one sentence a user would recognise ("import a
project and see its files", "save, close, reopen - nothing lost"), drawn from the product's
promises and existing flows. Per journey: the test that proves it today, or `uncovered`. Only these
need an e2e test through the real surface once `ui-acceptance-required` is `core`.

**The gate set** - the stage's defaults, then adjusted to this project with a reason per
deviation:

| Key | prototype | mvp | stable | live |
| --- | --- | --- | --- | --- |
| `ac-tests-required` | `false` | `true` | `true` | `true` |
| `ui-acceptance-required` | `false` | `false` | `core` | `core` |
| `e2e` | `none` | `none` | the core-journey suite | the suite |
| `e2e-all` | `none` | `none` | `none` | set if the flows are a suite of their own |
| sprint ends with a release check | no | no | yes | yes |
| `release-verify` | `none` | `none` | `auto` | `auto` |
| `release-plan` / `release-dry-run` | `none` | `none` | optional | set |

The release check at sprint end follows from `stage`; it has no key of its own. A key whose value
is a command gets a command that **exists today** - never a planned one, which would turn every
gate red. Where the stage needs a command the project does not have yet (no core-journey suite, no
dry run), the key keeps its current value and a story builds the command; the report names the
target value and the story.

**Release and tests together** - check the fit, one line per misfit with its evidence: a release
that publishes on push while no PR lane blocks the merge; a release lane that runs the full suite a
second time instead of a smoke; a release lane that skips the PR lane on an unprotected branch;
tests no command runs; e2e flows taxing the PR lane beyond its budget; `commit-style: plain` while
the release derives its bump from Conventional Commits; a release without user-facing notes;
`release-verify: auto` with no workflow to read. No misfit is a valid verdict.

**Test lanes** - when the project has CI or the recommended stage is `stable` or `live`: the
`## Test lanes` table as `test-gates` defines it (`| Lane | Command | Where | Blocks | Budget |`),
only with commands that exist or that a story creates (`(story NNN)` in the cell). Where to put a
test whose value or runtime is unknown is not guessed: that is `/common:architecture-review tests`.

**What to build** - the catch-up from today to the recommended stage, as at most five stories in
build order, each one refine's worth (S or M). A story of an earlier solution review that is still
open is referenced, not written again.

**Questions** - only real direction decisions you cannot settle from the evidence: which journeys
are core when the promises are ambiguous, whether a release to users is intended at all, a stage
the evidence splits between two. Ask with `AskUserQuestion`, bundled, once, at most four
questions, your recommendation as the first option. Everything else you decide and justify.

## Phase 4 - write

**The review** `<architecture-path>/<YYYY-MM-DD>-solution-review.md` (create the folder if
missing; a second run on the same day replaces that day's file), in the profile's `doc-language`
(default English) - except the frontmatter and the profile block, which stay as the keys are:

```markdown
---
date: <YYYY-MM-DD>
stage: <recommended stage>
stories-done: <done stories from Phase 1 step 6; 0 without ai-scrum>
---
```

Then a decision record, not an essay - about one screen:

1. **Title and one line** - commit, current stage (or `live (default)`) → recommended stage, the
   tech leads consulted with their skills, `no tech lead` where you answered alone.
2. **Where the project stands** - at most eight evidence bullets, each with its source.
3. **Recommended stage** - the stage and why in three to five lines; then the one signal that
   would move it to the next stage, so `/roadmap check` and the next review can watch for it.
4. **Core journeys** - numbered, each with its test or `uncovered`.
5. **Profile diff** - one fenced block of exact `key: value` lines under their profile section
   headings, ready to paste into `.claude/ai-scrum.md`: `## Stage` with `stage` and
   `core-journeys` (`a; b; c`, or `none`), and `tech-debt-limit` / `architect-review-every` only
   if you change them; `## Acceptance` with `ac-tests-required` and `ui-acceptance-required`;
   `## Verify` with `e2e` and `e2e-all`; `## Release` with `release-verify`, `release-plan` and
   `release-dry-run`. The block holds the whole gate set, valid today. Below it, one line:
   `Changes: <key> <now> -> <new>, ...`, plus each target value waiting for a story
   (`e2e: none -> npm run test:core after story 051`).
6. **Release and tests** - the fit verdict and the misfits.
7. **Test lanes** - the proposed table, when relevant, marked as a proposal for `CLAUDE.md`.
8. **Stories** - `| Id | Story | Kind | After |`, then `Open tech debt: <n> + <new> / limit
   <tech-debt-limit>`; over the limit is said plainly, it is the user's call.
9. **Measurements wanted** - what `/common:architecture-review tests` should settle, or nothing.
10. **Next step** - always last: `/ai-scrum:setup` reads the newest solution review and offers its
    profile diff as the preselected answers. Without ai-scrum: paste the block once the project
    adopts it. The `## Test lanes` table goes into `CLAUDE.md` by hand - no plugin writes that file.

**The stories** (only with an ai-scrum profile; otherwise they stay as rows in the report, each
with its requirement and criteria in two or three lines). Mirror the architecture review's drafts:

- Next free id: the highest id under `requirements-path`, its `done/` folder and `done/INDEX.md`,
  plus one, formatted per `story-id-format`; ids assigned in build order. Filename per
  `story-id-format` plus a slug of the title.
- Frontmatter from `<requirements-path>/_TEMPLATE.md` (without one, the newest existing draft's
  shape) with `status: draft` and today's date. `kind: debt` on every story that builds no
  user-visible capability - a PR lane, a core-journey suite, a release dry run, a lane clean-up -
  which is the usual case here, and those count toward `tech-debt-limit`; `kind: feature` on the
  rest. A template without a `kind` line gets one after `status`.
- **Requirement:** who needs what and why, then
  `Today ([solution review <date>](<relative link to the review>)):` with the evidence and its
  sources.
- **Acceptance Criteria:** numbered `AC1`..., each observable and machine-checkable - a workflow
  job that must exist and block, a command that must exit 0, a named test that must fail on a
  seeded defect, a search that must return nothing. "Is more robust" is not one.
- **Open Questions:** the alternatives a tech lead raised or you left open, as decisions for
  `/refine`.
- Every section the template leaves to `/refine` or `/build` keeps its placeholder exactly as the
  template has it. No plan, no deliverables.

Afterwards check by search that every story file exists, has `status: draft` and a unique id, and
links the review.

## In the chat

At most eight lines: the review path; current → recommended stage; the core journeys in one line;
the `Changes:` line; the misfit that matters most; the story range; the next step.

## Rules

- **Applies nothing.** Writes the review and the story drafts - nothing else. No profile, no
  `CLAUDE.md`, no settings, no workflow, no code. No commit, no push; no story leaves `draft`.
- **Measures nothing.** No build, no test run, no install; timings come from existing reports or CI
  history, or are `not measured` and go to `/common:architecture-review tests`.
- **Evidence, not taste.** Every stage claim, misfit and story cites a file, a command or a
  report. A deviation recorded in `CLAUDE.md` is respected, not re-litigated.
- **At most three tech leads**, one question each, all in one message. No reviewer fan-out - that
  is the architecture review.
- **One question round**, only for direction decisions.
