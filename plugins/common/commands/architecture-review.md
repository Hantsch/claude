---
description: Whole-codebase architecture review - one reviewer per dimension, findings merged and verified, a dated report and one draft story per confirmed cluster.
argument-hint: [scope]  (optional: a path or module name to narrow the review)
model: opus
effort: high
---

# Architecture review

A sprint review sees one sprint. This command looks across all of them: independent reviewers
read the codebase one dimension each, their findings are merged by root cause, each is checked
by an agent that tries to refute it and one that judges whether it is worth fixing, and the
result is a dated report plus one draft story per confirmed cluster of findings.

**When to run it:** at the end of a phase or milestone, when the roadmap's follow-up list has
grown past about 15 lines, or when the user asks. Not per sprint - it costs dozens of agents,
and its value is the view across sprints that no sprint review has.

**What it enforces: nothing.** It reads code and writes markdown - a report and stories with
`status: draft`. No test, lint rule or hook comes out of it, and no story gets scheduled. Every
count is true for the commit the report names; `/refine` re-measures before it plans, and the
code changes only when a story is refined and built. What it does not see: runtime behaviour,
performance under load, and any file no reviewer opened.

`$ARGUMENTS`, if set, narrows the review to a path or a module name. Empty means the whole repo.

## Mechanics

- **Every `Agent` call is foreground**, with `subagent_type: "general-purpose"`, `model` written
  out and `run_in_background: false`. An unset `model` inherits the session model; an unset
  `run_in_background` means background. Several calls in one message run concurrently and return
  together - that is how every fan-out below runs. One call per message is not parallel.
- **Never end a turn waiting for an agent.** A turn without a tool call ends the run. No
  background tasks, no polling loops, no `sleep`, no `ScheduleWakeup`: foreground calls are the
  whole mechanism.
- **Status lines.** Every step that can take longer than about three minutes is framed by two
  lines. Before: what starts and how many agents, the clock, how long the same phase took last
  time, the file to watch, and the escape - `Verify · 20 agents (batch 1/2) · started 14:05 ·
  last run 18 min · watch docs/reviews/2026-10-02-work/progress.md · Esc + rerun resumes`. The
  clock is never typed: it is the output of the `Bash` call that appends
  `- <timestamp> · <phase> · started` to `<work>/progress.md`. The last duration comes from the
  previous report's "Method and limits"; without one write `no estimate`, never a guess. After:
  one line, result and elapsed - `Review done · 12 reviewers · 118 raw findings · 21 min`.
  Nothing else goes between delegations, in particular no summary of what an agent said.
- **The work directory** `<reviews>/<date>-work/` holds every intermediate result as soon as it
  exists. A run stopped by a usage limit resumes at the first phase whose file is missing instead
  of starting over; if the directory exists at start, say which phase resumes and continue.

## Phase 0 - ground the review

1. Read `CLAUDE.md` with its deviations, and `.claude/ai-scrum.md` if it exists. Take from the
   profile: `requirements-path`, `story-id-format`, `roadmap-path`, `systems-path`,
   `doc-language` and the "Context to read before coding" list. `<docs>` is the directory that
   holds `roadmap-path`; the report goes to `<docs>/reviews/` (`<reviews>` below). Without a
   profile, ask the user where the story drafts go and confirm `docs/reviews/` for the report -
   never guess a folder. Report and stories are written in `doc-language` (default English).
2. Record `git rev-parse --short HEAD`, the branch and whether the tree is dirty. Map the repo:
   source roots, modules or feature areas with their size (files, lines), test layout, CI, docs.
   Read the architecture doc and docs index if present, the roadmap's follow-ups (a finding they
   already name is marked *tracked*) and the newest earlier report in `<reviews>` (a finding it
   already raised says so - repetition is itself evidence).
3. Choose the dimensions from what the repo is, not from a list. The defaults, to adapt to the
   stack - do not assume Electron, a web app or a service:
   - layering and security (process or tier boundaries, trust of external input, secrets);
   - contracts at the boundaries (IPC, HTTP/RPC API, public library surface, file formats);
   - services and core logic (ownership, lifetime, dependency direction);
   - one per module or feature area - split one of more than ~15k lines, merge tiny ones;
   - UI state and conventions, where there is a UI;
   - tests and tooling (suite shape, shared support, CI, gates, flakiness);
   - docs and process (docs against the code, decision records, follow-up hygiene);
   - cross-module duplication (the same shape hand-written in several places);
   - robustness and error handling (failure paths, shutdown, persistence, timeouts).
   Typically 8-14 reviewers. With a scope: only the dimensions that intersect it, plus
   duplication and robustness restricted to it.
4. Next free story id: the highest id under `requirements-path`, its `done/` folder and any done
   index, plus one, formatted per `story-id-format`.
5. Show the plan in one block and ask once whether to proceed: the dimensions with what each
   covers, the agent budget (reviewers + 1 merge + up to ~40 verify + story writers), the output
   paths. This is the run's only question besides the missing-profile folder.

## Phase 1 - review

All reviewers in ONE message: `model: "sonnet"`, except cross-module duplication and robustness,
which may get `model: "opus"` - both need reading across the whole tree rather than inside one
area. Each prompt is self-contained: repo root and commit, the dimension and the paths it covers,
the files to read first (`CLAUDE.md`, the profile's context list, the architecture doc), the
rules, and the output file. The rules, verbatim:

- Read the code, not only its docs; open every file you cite.
- Count. "36 copies in 26 files" with the search you counted with, never "many" or "several".
- Cite `file:line` for every claim. A claim without a location is dropped.
- A deviation documented in `CLAUDE.md`, an ADR or a story's decisions is not a finding; its
  missing enforcement can be.
- At most 10 findings, the most consequential. Instances of one cause are one finding.
- Severity: *high* = a correctness or security defect, or a structural cost every change in the
  area pays; *medium* = real cost or drift risk, bounded; *low* = local, no drift risk.
  Effort: S (hours), M (a day or two), L (more, or several stories).
- Change nothing. Read-only, except your own output file.
- Write to `<work>/1-<dimension>.md`, one block per finding: `title`, `category`, `severity`,
  `files`, `evidence` (the counted facts), `problem` (what it costs and whom), `recommendation`
  (the smallest change that removes the cause), `effort` - then an assessment of 3-6 sentences,
  what is good first. Return only the path, the count per severity and the assessment.

## Phase 2 - merge

ONE agent, `model: "opus"`, reads every `1-*.md` and writes `<work>/2-findings.md`: findings
with one root cause merged into one (three reviewers' sightings become one finding with three
evidence lines; a symptom folds into its cause), the highest justified severity kept, ids
`F01`... in severity order, each block naming its source dimensions and its *tracked* or
earlier-review mark. Findings without `file:line` evidence are dropped and counted. It returns
raw count, merged count and the count per severity.

## Phase 3 - verify

Per finding two agents, both `model: "sonnet"`:

- **Refuter** - tries to prove the finding wrong at the recorded commit: re-runs the counts,
  opens every cited line, looks for the documented decision, the test that covers it, the caller
  that makes it moot. Returns `stands`, `partly` or `refuted`, corrected counts and severity, and
  one paragraph of why.
- **Value judge** - is it worth doing, priority P1 (next refactoring sprint) to P3
  (opportunistic), the regression risk (what could break, which tests guard it), and a better
  scoping if there is one (smaller cut, order, what to leave out). It may use `git log` churn.

**Hard cap: about 40 verify agents per invocation.** Measured: a 164-agent verify fan-out hit the
session limit and then the weekly limit, and most findings ended up unverified anyway. Up to 20
findings, verify all. Above that, verify high and medium only; if those alone exceed the cap,
high first, then medium in id order until it is reached. Every finding left unverified is named
by id in "Method and limits" and carries `reviewer-only` - never silently. Send the pairs in
batches of at most 20 calls per message, each batch framed by status lines, and append each
batch's verdicts to `<work>/3-verify.md` before the next batch starts.

A refuted finding stays in the table, marked refuted, and yields a story only for what still
stands.

## Phase 4 - report and stories

**Cut the stories.** A cluster is the set of findings one change removes; a finding may feed two
stories. A cluster becomes a story when at least one of its findings stands and was judged worth
doing, or is an unverified high or medium. A story fits one refine (S or M; L only when it
cannot be cut). Priority comes from the value judges - correctness and security first; "after"
names hard dependencies only. Assign the next free ids in build order. A finding without a story
is listed under "left out on purpose", with the reason.

**The report** `<reviews>/<date>-codebase-review.md` (scoped: `<date>-<scope-slug>-review.md`):

1. Title and a short intro - commit, reviewer count, raw and merged findings, verification
   coverage, the story id range - and how to read it: story map to act, findings table as
   evidence.
2. **Verdict.** What is good first, concretely and with numbers; then the 3-5 structural causes
   that explain most findings, each with its finding ids; then any correctness or security item
   that should go before everything else.
3. **Story map.** `| # | Story | Findings | Prio | Effort | After |`, in build order within each
   priority, followed by a suggested cut into sprints that are each demonstrable on their own.
4. **Findings.** `| Id | Sev | Finding | Check | Story |`, one line per finding. Check is
   `refuter` (survived the refuter), `judged` (value judge only), `refuted`, or `reviewer-only`;
   a legend says so. Then the left-out list.
5. **Method and limits.** The dimensions and their models, agents and minutes per phase (the next
   run's status lines quote them), the unverified ids, the commit, branch and dirty state, and
   what no reviewer covered.

**The story drafts.** Delegate the writing: agents with `model: "sonnet"`, up to six stories
each, all in ONE message. Each gets the story list it owns (id, title, findings), the path of
`<work>/2-findings.md` and `3-verify.md`, the report path and the template - `_TEMPLATE.md` in
the requirements folder; if there is none, the shape of the newest existing draft. Rules:

- Filename per `story-id-format` plus a slug of the title; frontmatter from the template with
  `status: draft` and today's date.
- **Requirement:** who wants what and why, then a paragraph
  `Today ([review <date>](<relative link to the report>), F04, F31):` with the counted evidence
  and `file:line` locations. A `reviewer-only` finding says that `/refine` re-measures it first.
- **Acceptance Criteria:** numbered `AC1`... - each observable and machine-checkable: a named
  test that fails on a seeded defect, a search that must return nothing, a file or export that
  must exist, a command that must exit 0. "Is cleaner" or "is easier to maintain" is not one.
- **Open Questions:** the alternatives the value judge or refuter raised, as decisions for refine.
- Every section the template leaves to `/refine` or `/build` keeps its placeholder exactly as the
  template has it (`<!-- Filled by /refine NNN. -->` with the id filled in). No plan, no
  deliverables.

Afterwards check by search that every story file exists, has `status: draft`, a unique id, and
names its findings and the report.

## Phase 5 - index and clean up

- `roadmap-path`, section "Open / unprioritised": one row - topic `Codebase review <date>`, the
  state as finding count and story range with a link to the report, next step `/roadmap plan`.
  Existing follow-ups are not deleted; `/roadmap check` ages them. No roadmap or no such section:
  add nothing and say so.
- The docs index (`<docs>/README.md`), if present and it lists documents: one line for the
  report where reviews belong.
- Delete `<work>` once the report and every story exist.
- Commit nothing. The user reads the drafts and decides.

## Final report

At most ten lines: the report path; the story range with the count per priority; raw, merged and
per-severity finding counts; verification coverage and the unverified ids; the two items to do
first; the next step (`/roadmap plan`, or `/refine <id>` for a P1 that should not wait).

## Rules

- **Read-only on the code.** No agent edits source, tests or configuration. The run writes only
  the work directory, the report, the story drafts, the roadmap row and the docs-index line.
- **Measured, not imagined.** A finding without a count and a location does not survive the
  merge; a severity the refuter corrected is shown corrected.
- **A documented deviation is not a finding.** Project facts come from the profile and
  `CLAUDE.md`; nothing about the stack is assumed.
- **No commit, no push**, and no story leaves `draft` - scheduling is `/roadmap plan`'s job.
