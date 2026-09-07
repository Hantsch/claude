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
/build <id>            implement it  (cheap)   -> code + tests + verify + clean review + Done
/sprint <id>           run a whole sprint      -> branch, all stories, review.md

/ai-scrum:setup        install / update        -> the six commands above + scaffolding
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

Nothing project-specific is baked into a command — that is what makes the same six files work
in every repository, and what lets an update replace them wholesale.

Each installed file carries a marker (`<!-- ai-scrum:managed 2.0.0 ... -->`) and a hash in
`.claude/ai-scrum.lock`. On the next `/ai-scrum:setup`, an untouched copy is replaced silently;
one you edited is diffed and you are asked first. Local adaptations belong in
`.claude/ai-scrum.md` or `CLAUDE.md`, not in the workflow files.

## The loop

```
concept ──► roadmap plan ──► story (draft) ──► refine ──► build ──► done
                 ▲                                                  │
                 └──────────── sprint review / roadmap check ────────┘

              sprint = clarify -> refine all -> build all -> review.md
```

- **Small deliverables, each with its own test.** Refine cuts a story into `D1…Dn` and maps
  every acceptance criterion to the test that will prove it; build pulls them through in one go,
  test included, and `## Done` records which test proved which criterion.
- **Acceptance is the suite, not a click list.** A story is `done` when its criteria's tests pass
  and the review is through — no manual round behind it, nothing held open for someone to walk.
  See [Acceptance is the test suite](#acceptance-is-the-test-suite).
- **Whoever implements does not verify.** Build always delegates the code review to a fresh
  agent that sees only spec + diff, and reports PASS/FAIL/UNCLEAR with evidence.
- **Two tiers, chosen in advance and pinned.** Refine marks the few risky deliverables
  `→ deliverable-hard` (Opus + high effort) with a one-sentence justification; everything else
  runs on Sonnet, written out on the call rather than inherited. That matters more than it
  sounds: an `Agent` call without an explicit `model` takes the *session* model and passes it
  down its whole subtree, so a session switched to Opus mid-run re-tiers everything below it
  at roughly five times the price, invisibly. Build is forbidden from escalating on its own —
  subagents are the bulk of the bill, and the tier decides it.
- **Everything is delegated in the foreground.** A background subagent's completion
  notification reaches the top-level session only, never a subagent — so a build agent that
  backgrounds a deliverable and then waits for it waits forever, and the sprint stops with
  nothing in the working tree to show for it. Every delegation therefore passes
  `run_in_background: false`; parallelism is several foreground calls in one message, which
  run concurrently and block until all of them return.
- **Open questions belong to the user.** Anything a story deliberately left open is never
  decided by an agent. In a sprint the orchestrator bundles those questions, records the
  answers as binding `(User)` decisions, and only then lets the agents run.
- **Resumable.** All state is in files, so `/sprint SNN` continues at the first open spot after
  a context reset.

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
