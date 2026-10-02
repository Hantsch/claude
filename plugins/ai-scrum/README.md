# AI Scrum

A spec-driven, agent-orchestrated Scrum workflow for Claude Code. Every artifact lives in the
repository — no plan mode, no external plan files, no reliance on memory. **The workflow itself
lives there too:** the plugin installs it into the project, so anyone who clones the repo can
run it without installing anything.

```
/concept <topic>       requirements interview  -> docs/concepts/<topic>.md
/roadmap check         drift check             -> docs/ROADMAP.md kept honest
/roadmap plan          cut the next sprint     -> story drafts + sprints/SNN/sprint.md
/refine <id>           plan a story  (Opus)    -> Plan + Deliverables + AC -> test mapping
/build <id> [--full]   implement it  (cheap)   -> code + tests + narrow gate + clean review + Done
/sprint <id>           run a whole sprint      -> branch, all stories, regression gate, review.md

/ai-scrum:setup        install / update        -> the five commands above, two agents, profile + docs
```

The plugin ships exactly one command — `setup`. Everything else is payload it copies into your
project.

## Install

Once per machine, for whoever installs or updates the workflow:

```
/plugin marketplace add Hantsch/claude
claude plugin install ai-scrum@hantsch --scope user
```

Install user-scoped on purpose: project scope is what triggers the `Unknown command` failure
described below.

Then, in every project that should use the workflow:

```
/ai-scrum:setup
```

Setup surveys the project, suggests build/test commands from what it finds, asks about the few
things it cannot know, and writes `.claude/commands/`, `.claude/agents/`, `.claude/ai-scrum.md`
and the missing `docs/` scaffolding. **Commit those files** — from then on every collaborator
has `/refine`, `/build`, `/sprint` and friends by cloning, with no plugin, no marketplace and
no install step. `/ai-scrum:setup check` reports without changing anything.

Later, to pull a newer version of the workflow into the project:

```
/plugin update ai-scrum
/ai-scrum:setup
```

If `/ai-scrum:setup` comes back as `Unknown command` — especially in the VS Code extension while
the same command works in a terminal — see
[Troubleshooting](../../README.md#troubleshooting) in the marketplace README. The usual fix is
`claude plugin install ai-scrum@hantsch --scope user`.

## What lives where

| | lives in | owned by |
| --- | --- | --- |
| The process (commands, agents) | `.claude/commands/`, `.claude/agents/` **in your repo** | the plugin, refreshed by `/ai-scrum:setup` |
| Project **facts** (build/test commands, paths, branch base, acceptance policy) | `.claude/ai-scrum.md` | `/ai-scrum:setup`, editable by hand |
| Project **rules** (architecture, guardrails, conventions) | `CLAUDE.md` + skills | the project; the commands read them, never write them |

Nothing project-specific is baked into a command — that is what makes the same seven files work
in every repository, and what lets an update replace them wholesale.

Each installed file carries a marker (`<!-- ai-scrum:managed <version> ... -->`) and a hash in
`.claude/ai-scrum.lock`. On the next `/ai-scrum:setup`, an untouched copy is replaced silently;
one you edited is diffed and you are asked first. Local adaptations belong in
`.claude/ai-scrum.md` or `CLAUDE.md`, not in the workflow files.

## The loop

```
concept ──► roadmap plan ──► story (draft) ──► refine ──► build ──► done
                 ▲                                                  │
                 └──────────── sprint review / roadmap check ────────┘

              sprint = clarify -> refine all -> build all -> regression gate -> review.md
```

- **Small deliverables, each with its own test.** Refine cuts a story into `D1…Dn` and maps
  every acceptance criterion to the test that will prove it; build pulls them through in one go,
  test included, and `## Done` records which test proved which criterion.
- **Acceptance is the suite, not a click list.** A story is `done` when its criteria's tests pass
  and the review is through — no manual round behind it, nothing held open for someone to walk.
  See [Acceptance is the test suite](#acceptance-is-the-test-suite).
- **Whoever implements does not verify.** Build always delegates the code review to a fresh
  agent that sees only spec + diff, and reports PASS/FAIL/UNCLEAR with evidence. Who runs on
  which tier is in [Who runs what](#who-runs-what).
- **Reuse, not copies.** Refine names the helper a deliverable reuses, and a shape that already
  exists twice is extracted before it is used a third time. Deliverable agents stop on a copied
  shape, tests are named after behaviour rather than stories and use the profile's
  `test-support` first, and the review flags copied blocks and comments that narrate history.
- **Findings leave the review.** A finding left unfixed becomes a follow-up line in the roadmap
  or a story draft, never a list that stays in `review.md`. `/roadmap check` turns follow-ups
  older than three sprints into stories, and moves concepts whose milestones are all `done` to
  `systems/`. A story that changes a documented system updates that system's doc too.
- **A sprint is observable from outside.** `/sprint` commits `SNN: sprint started` on the base
  branch before it cuts the sprint branch, frames every long step with a status line (what
  runs, since when, how long it took last time, which file to watch, how to stop), grows
  `progress.md` per step, deliverable, verification and review, and treats the final report as
  the end of the run — nothing keeps running behind it. A status question is answered with the
  last trail line and the elapsed time, not with "it is running".
- **Open questions belong to the user.** Anything a story deliberately left open is never
  decided by an agent. In a sprint the orchestrator bundles those questions, records the
  answers as binding `(User)` decisions, and only then lets the agents run.
- **Resumable.** All state is in files, so `/sprint SNN` continues at the first open spot after
  a context reset.

## Who runs what

`/sprint` is not a subagent. It runs in **your session**, the top level, on the model its
frontmatter sets (Sonnet). It is the only part that asks you anything, and the only one that
commits. Everything below it is a fresh subagent with `model` set explicitly on the call. The
build agent is the story's orchestrator: it writes no code itself. Refine is not part of a
story's build. It is a phase of its own: every story is planned before the first one is built.

### The agent graph — one sprint, two stories

```
/sprint S07                      your session · Sonnet · orchestrator, asks you, commits
│
├─ refine 042                    Opus · plans the story into its file      ┐ all in one
│  └─ Explore / Plan             Sonnet · research (Opus for architecture) │ message,
├─ refine 043                    Opus                                       ┘ concurrent
│  └─ Explore / Plan
│
├─ build 042                     Sonnet · story orchestrator, writes no code
│  ├─ D1                         Sonnet · one deliverable plus its tests
│  ├─ D2                         Sonnet · concurrent with D3 only if their files are disjoint
│  ├─ D3 → deliverable-hard      Opus · high · at most one per story, chosen by refine
│  ├─ verify                     Sonnet · narrow gate + acceptance walk, changes no file
│  ├─ review 1                   Sonnet · clean agent: spec + diff → PASS / FAIL / UNCLEAR
│  ├─ fix                        Sonnet · a confirmed finding is fixed like a deliverable
│  └─ review 2 (hard)            story-review-hard · Opus · high · only if the story is marked
│
├─ build 043                     Sonnet · strictly after 042, it may build on it
│  └─ …
│
├─ gate                          Sonnet · build, full test, full e2e
├─ e2e-all                       background Bash in your session, not an agent
├─ attribution                   Sonnet · only on red: flaky / pre-existing / bisect to a story
├─ regression fix                Sonnet · per attributed story, at most two attempts
└─ testplan                      Sonnet · only with `testplan: required`
```

The tree is three levels deep at most. Run outside a sprint, the same pieces run one level
higher: `/refine` runs in your session on Opus with high effort, and `/build` runs in your
session on Sonnet as the story orchestrator. In a sprint the refine agent is pinned to Opus
too, but its effort is not set on the call.

| Agent | Gets | Returns |
| --- | --- | --- |
| refine | the story, linked docs, `CLAUDE.md`, the profile's context files | `ready` or `BLOCKED: …`, the plan in ≤ 5 lines, decisions, a `tiers:` line |
| build | the story file, read once | ≤ 20 lines: result, commit message, decisions, `tiers:` |
| deliverable | one D's text, its files, its test lines. It does **not** open the story file | ≤ 10 lines, or `PARTIAL` after ~35 tool calls |
| verify | the filled-in verify commands and the `## Acceptance Tests` lines | ≤ 15 lines: per command green/red, per criterion its test |
| review 1 | the story file, the diff, the D → files map, the test mapping | verdict + findings as `file:line` |
| review 2 | the same, plus review 1's verdict and the named risk | verdict + findings, only what review 1 could not see |

### The pipeline

```
phase 0    `S07: sprint started` on branch-base ─► cut the sprint branch
phase 1a   open questions of all stories ─► you, bundled ─► recorded as binding (User) decisions
phase 1b   refine every draft story, concurrently ─► ready | BLOCKED: user question
           (one follow-up round) ─► one line of tiers: the last moment to stop the run
phase 2    per ready story, in list order:
             build ─► D1 ─► D2 ─► … ─► verify ─► review 1 ─┬─► [review 2 hard] ─► Done
                                          ▲                 │
                                          └── fix ◄─────────┘ findings, ≤ 3 cycles in all
           ─► the orchestrator commits `042: …`, or `WIP 042: blocked — …`
phase 2b   regression gate: short suites + e2e-all on the finished branch
           red ─► attribute (flaky / pre-existing / story) ─► fix on the branch, or a merge blocker
phase 3    review.md · testplan.md (manual residue only) · roadmap ─► `S07: sprint review + roadmap`
```

A deliverable that comes back `PARTIAL` goes to one fresh agent with the partial report. A second
`PARTIAL` is a plan gap and blocks the story. A blocked story does not stop the sprint: its partial
work is committed as `WIP`, and stories that depend on it are skipped.

### Where the acceptance happens

No agent signs a story off at the end. Acceptance is a chain, and every link in it is a fresh agent
that did not write the code:

1. **Refine** maps every acceptance criterion to a deliverable and a named test. No `ready`
   without that, and `/build` checks it again before it starts.
2. **The deliverable** writes that test as part of the behaviour, not as a later D.
3. **Verify** runs exactly those tests and walks the mapping criterion by criterion. A named test
   that did not run is not green.
4. **Review 1** judges every criterion with evidence, and opens every test to ask whether a broken
   implementation would make it fail.
5. **Review 2** runs only where refine could name the plausible wrong implementation that passes
   the tests and a default review. It looks for that implementation, not for review 1's list
   again.
6. **The regression gate** proves the stories together, once, on the finished branch.

### Why it is wired like this

- **Tiers are chosen in advance, set on every call, and budgeted.** An `Agent` call without an
  explicit `model` takes the *session* model and passes it down its whole subtree. A session
  switched to Opus mid-run would re-tier everything below it at roughly five times the price,
  without any visible sign. So Sonnet is set on every call, refine marks at most one
  `deliverable-hard` per story with a one-sentence reason, and build may not escalate on its own.
  Every Done section ends with a `tiers:` line, and the sprint review collects them into a tier
  record. That record is the number to watch when tuning the budget.
- **Everything is delegated in the foreground.** A background task's completion notification
  reaches only the top-level session, never a subagent. A build agent that backgrounds a
  deliverable and waits for it would wait forever. Every delegation passes
  `run_in_background: false`. Parallel work is several foreground calls in one message: they run
  concurrently and block until all of them return. The one background task in the whole run is
  `e2e-all`, and it is started from your session because a tool call ends after ten minutes.
- **Context is the cost.** An agent re-reads its whole context on every turn. So orchestrators
  read no source files, deliverable agents get only their D and never the story file, suite
  output stays in the verify agent, and every return has a line limit.

## What setup creates in a project

```
.claude/
  commands/                    the workflow, plugin-owned
    refine.md  build.md  sprint.md  roadmap.md  concept.md
  agents/
    deliverable-hard.md  story-review-hard.md
  ai-scrum.md                  project profile (facts, versioned)
  ai-scrum.lock                version + hash per managed file
docs/
  README.md                    docs index (only if absent or plugin-generated)
  ROADMAP.md                   the one status/planning source (only if absent)
  requirements/
    _TEMPLATE.md  README.md    story template + workflow doc
    done/INDEX.md              story history, one line per story
  sprints/
    _TEMPLATE/sprint.md        sprint template
    README.md  done/           workflow doc + archive
  concepts/  systems/          designed vs. implemented
```

Project-owned folders (`wiki/`, `adr/`, `features/`, `design/`, …) are never touched. On an
update, plugin-generated templates and READMEs are refreshed; stories, sprints, roadmap content
and your `## Notes` never are.

Setup checks `.gitignore` in both directions and reports what it finds, without ever editing the
file: `.claude/` and the docs paths **must not** be ignored, or the workflow and the stories never
reach anyone else; generated data — build output, dependency folders, test and screenshot
artefacts, seeded fixture or demo-data folders, `.env*` — **must** be, or it turns into merge
conflicts nobody can resolve and can carry real content into a public repository.

## Changelog DoD (optional)

`changelog-path` in the profile points at a **user-facing** changelog (`version.md`,
`CHANGELOG.md`) — not the git history. When it is set, `/build` requires an entry for every
user-facing feature or fix under `# Features` / `# Fixes` of the current version section, and
`/sprint` sweeps the sprint's stories for missing ones. House style: appended to the current
section only, short, punchy, a little funny, in `doc-language`, about what the user can now do
rather than how it was built. Tests, refactors and internal changes get no entry, and a story with
no user-facing change adds nothing.

Default is `none`, and then the rule is dormant — nothing asks for a changelog that does not exist.

## Acceptance is the test suite

**A sprint does not end with a list of things for you to click.** Every acceptance criterion is
mapped to one automated test during refine — that mapping is `## Acceptance Tests` in the story,
and no story reaches `ready` without it. The test is written by the same deliverable that
implements the behaviour, and `/build` sets `done` when those tests pass and the clean-agent
review is through. There is no approval state behind that: you read `review.md` and merge. What a
later walk-through finds becomes a new story, not a reopened one.

Three switches in the profile:

- `ac-tests-required` (default `true`) — every criterion needs a named test before `ready` and a
  passing one before `done`. Off only for spikes.
- `ui-acceptance-required` — a criterion about something the *user does* is proven through the
  real surface: the `e2e` command from `## Verify`. A console call or a renderer test with a faked
  backend is not a substitute. If `e2e` is `none`, the harness does not exist yet — refine plans
  it as a deliverable or names the gap, and never converts it into a manual step. `false` for a
  library, CLI, service or mod.
- `testplan` (default `optional`) — `testplan.md` is not a gate any more. `optional` writes only
  the criteria declared `manual residue`, and no file at all when there are none.

**Manual residue** is the bounded exception: a criterion that cannot be automated for a real
reason (an OS-level dialog, specific hardware, a paid external service), declared in the story
with that reason. It is listed in the sprint review and holds nothing open. "Hard to test" is
not a reason — it is work.

Because the implementing agent also writes the test, the clean-agent review has an explicit job:
open each acceptance test and judge whether a broken implementation would make it fail. A green
tautology looks exactly like acceptance from the outside, and this is the only place that catches
it.

## Narrow per story, broad per sprint

Running every suite after every story gets slow as a project grows — hundreds of unit test files
and dozens of UI flows per story, most of them untouched by it. Running only a story's own tests
misses the regression one story causes in another's flow. So the gate is split:

- **Per story (`/build`):** `build`, `lint`, `typecheck` as always; `test-story` instead of
  `test` — the tests the story's uncommitted changes affect (`npx vitest run --changed HEAD`);
  and `e2e-story` instead of `e2e` — a template filled with the files and test names the story
  mapped to e2e in `## Acceptance Tests` (`npx playwright test {files}`,
  `npm run ui:flow -- {test}`). A narrowed run that missed a named test does not count as green.
- **Per sprint (`/sprint`, after the last story, before `review.md`):** the full `test`, the
  full `e2e` and `e2e-all` — every acceptance flow, where those are a suite of their own. The
  short suites run inside one agent; `e2e-all` runs from the orchestrator as a background task
  with its log in the sprint folder, because a single tool call ends after ten minutes and a
  subagent is never told when a background task finishes. A red result is checked for
  flakiness and for failing already on the sprint's start, then bisected over the story
  commits; the story it lands on gets a fix commit on the sprint branch, or the failure is a
  merge blocker in the review. The gate has a launch budget — at most five launches per suite,
  usually one — so a flaky suite is reported as flaky instead of being relaunched until it is
  green. Either way `review.md` records it. A test found flaky or pre-existing goes into the
  profile's `e2e-quarantine` list. After that it is an expected failure and is not attributed
  again. If it is still quarantined two sprints later, it becomes a story. `e2e-cleanup` (optional) names the command that
  stops what a killed e2e run leaves behind; `/sprint` runs it before relaunching.
- **Standalone `/build`:** the narrow gate, and one closing line naming the full suites that
  have not run yet. `/build <id> --full` runs them once at the end instead.

All three keys are optional. Missing or `none` means the full `test` / `e2e` per story, exactly
as before, so an existing profile keeps working unchanged. The command lives in the profile
rather than in each `## Acceptance Tests` line because the line names the *target* (file, test)
and the invocation is the harness's — one template, not a hand-written command per story that
nobody checks.

## Migrating

**From plugin 1.x** (`/ai-scrum:refine` and friends came from the plugin): update the plugin and
run `/ai-scrum:setup`. It installs the same commands into `.claude/commands/` — where they are
called `/refine`, `/build`, `/sprint`, `/roadmap`, `/concept`, without the namespace. Commit
them. The plugin no longer registers those commands, so there is nothing to collide with once
every scope is on 2.x.

**From the original file-based version**, where the commands were hand-copied into
`.claude/commands/`: same paths, so setup treats your copies as modified, shows the diff and
asks per file whether to replace them. A deliberate local adaptation it finds is named
explicitly — that belongs in `.claude/ai-scrum.md` or `CLAUDE.md` now.

Existing story files keep their language and their headings — the commands treat the older
German section names (`## Anforderung`, `## Akzeptanzkriterien`, `## Offene Fragen`,
`## Modell-Hinweise`, `## Testplan (manuelle Abnahme)`, `## Entscheidungen (Sprint)`) as
equivalent to the English ones. Generated artifacts follow `doc-language` in the profile.

## Contributing / local testing

See the [repository README](../../README.md).
