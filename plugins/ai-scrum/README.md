# AI Scrum

A spec-driven, agent-orchestrated Scrum workflow for Claude Code. Every artifact lives in the
repository — no plan mode, no external plan files, no reliance on memory. The plugin carries the
*process*; each project carries only its own facts.

```
/ai-scrum:concept <topic>   requirements interview  -> docs/concepts/<topic>.md
/ai-scrum:roadmap check     drift check             -> docs/ROADMAP.md kept honest
/ai-scrum:roadmap plan      cut the next sprint     -> story drafts + sprints/SNN/sprint.md
/ai-scrum:refine <id>       plan a story  (Opus)    -> Plan + Deliverables in the story file
/ai-scrum:build <id>        implement it  (cheap)   -> code + verify + clean review + Done
/ai-scrum:sprint <id>       run a whole sprint      -> branch, all stories, review + testplan
/ai-scrum:setup [check]     install / update        -> .claude/ai-scrum.md + docs scaffolding
```

## Install

```
/plugin marketplace add Hantsch/claude
claude plugin install ai-scrum@hantsch --scope user
```

Install user-scoped on purpose: project scope is what triggers the
`Unknown command` failure described below.

Then, in every project that should use the workflow:

```
/ai-scrum:setup
```

Setup surveys the project, suggests build/test commands from what it finds, asks about the few
things it cannot know, writes `.claude/ai-scrum.md` plus the missing `docs/` scaffolding, and
offers to remove pre-plugin file copies of these commands. `/ai-scrum:setup check` reports
without changing anything.

If `/ai-scrum:…` comes back as `Unknown command` — especially in the VS Code extension while the
same commands work in a terminal — see
[Troubleshooting](../../README.md#troubleshooting) in the marketplace README. The usual fix is
`claude plugin install ai-scrum@hantsch --scope user`.

## Two sources of truth per project

| | lives in | owned by |
| --- | --- | --- |
| The process (commands, agents, templates) | the plugin | this repository, updated via `/plugin update` |
| Project **facts** (build/test commands, paths, branch base, acceptance policy) | `.claude/ai-scrum.md` | `/ai-scrum:setup`, editable by hand |
| Project **rules** (architecture, guardrails, conventions) | `CLAUDE.md` + skills | the project; the commands read them, never write them |

That split is the reason the plugin is portable: nothing project-specific is baked into a
command, and an update never has to merge your edits.

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
- **Two tiers, chosen in advance.** Refine marks the few risky deliverables
  `→ deliverable-hard` (Opus + high effort) with a one-sentence justification; everything else
  runs on the cheap tier. Build is forbidden from escalating on its own — subagents are the
  bulk of the bill, and the tier decides it.
- **Open questions belong to the user.** Anything a story deliberately left open is never
  decided by an agent. In a sprint the orchestrator bundles those questions, records the
  answers as binding `(User)` decisions, and only then lets the agents run.
- **Resumable.** All state is in files, so `/ai-scrum:sprint SNN` continues at the first open
  spot after a context reset.

## What setup creates in a project

```
.claude/ai-scrum.md            project profile (facts, versioned)
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

## Migrating a project that used the file-based version

`/ai-scrum:setup` detects `.claude/commands/{refine,build,sprint,roadmap,concept}.md` and the
two agent files, names any local adaptation it finds (that belongs in the profile or
`CLAUDE.md` now), and deletes them only after you confirm. Afterwards the commands are called
with their namespace: `/ai-scrum:refine 042` instead of `/refine 042`.

Existing story files keep their language and their headings — the commands treat the older
German section names (`## Anforderung`, `## Akzeptanzkriterien`, `## Offene Fragen`,
`## Modell-Hinweise`, `## Testplan (manuelle Abnahme)`, `## Entscheidungen (Sprint)`) as
equivalent to the English ones. Generated artifacts follow `doc-language` in the profile.

## Contributing / local testing

See the [repository README](../../README.md).
