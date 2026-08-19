# AI Scrum

A spec-driven, agent-orchestrated Scrum workflow for Claude Code. Every artifact lives in the
repository — no plan mode, no external plan files, no reliance on memory. **The workflow itself
lives there too:** the plugin installs it into the project, so anyone who clones the repo can
run it without installing anything.

```
/concept <topic>       requirements interview  -> docs/concepts/<topic>.md
/roadmap check         drift check             -> docs/ROADMAP.md kept honest
/roadmap plan          cut the next sprint     -> story drafts + sprints/SNN/sprint.md
/refine <id>           plan a story  (Opus)    -> Plan + Deliverables in the story file
/build <id>            implement it  (cheap)   -> code + verify + clean review + Done
/sprint <id>           run a whole sprint      -> branch, all stories, review + testplan

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

              sprint = clarify -> refine all -> build all -> review + testplan
```

- **Small deliverables, one acceptance at the end.** Refine cuts a story into `D1…Dn`; build
  pulls them through in one go and the user accepts once, based on `## Done`.
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

## Acceptance policy (P1/P2)

Two rules that only make sense for projects with a user-facing surface, so they are switches in
the profile:

- `ui-acceptance-required` (**P1**) — every user-facing capability needs a real path through the
  actual UI. An acceptance step for a user action that requires a console command or a direct
  internal call is a story gap, not a valid test.
- `live-smoke-required` (**P2**) — a green build is not acceptance. For a story with a visible
  surface the real flow must be driven through the running app (how, is `live-smoke-how` in the
  profile) before it may be `done`; otherwise it is handed over as "built, acceptance pending".

For a library, CLI or mod both stay `false` and the workflow accepts via tests.

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
