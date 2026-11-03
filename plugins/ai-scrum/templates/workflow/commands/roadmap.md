---
description: Roadmap ritual — checks ROADMAP.md against the real repo state, keeps it one screen long and advises on the project's stage (check), and/or cuts the next sprint out of the current milestone with the user (plan), or a cleanup sprint out of the tech debt (plan debt).
argument-hint: [check|plan|plan debt]
model: sonnet
effort: medium
---

<!-- ai-scrum:managed <ai-scrum-version> - plugin-owned, written by /ai-scrum:setup. Do not edit:
     setup diffs this file on update and asks before replacing it. Project facts go in .claude/ai-scrum.md. -->

Run the roadmap ritual: **$ARGUMENTS** (no argument: run `check` first, then offer `plan`).

## Project profile

Read `.claude/ai-scrum.md` first — `roadmap-path`, `requirements-path`, `sprints-path`,
`concepts-path`, `systems-path`, id formats, `doc-language` and the `## Stage` keys come from
there. If it is
missing, stop and say: run `/ai-scrum:setup` (ai-scrum plugin) first.

## Role

The roadmap is the entry point into the project: someone opening it after weeks away must see
within a minute where the project stands, what was done last and what to pick up next. It is a
**map, not a log**. Story truth stays in `requirements-path`, sprint detail in `review.md`,
design in the concepts — the roadmap links to those and never repeats them. This command keeps
it honest, keeps it short and turns it into the next sprint.

## The shape (and the budgets)

The roadmap has exactly these sections, in this order, as laid out in the template
`/sprint` and this command write into:

1. **Where we stand** — max. five lines, rewritten every time, never appended to: current
   phase/milestone and what is being built, what was finished last, the next concrete step,
   anything waiting on the user.
2. **Stage** — one line, `Stage: <stage> · signals: <list>`, then the open advice, one line
   each with its command (mode `check`, step 5). Only `check` writes it.
3. **Phase overview** — one table row per phase, with milestones done/total.
4. **Current phase** — one table row per milestone: number, name, status, sprint links, one
   note of at most one sentence. No paragraphs, no story lists, no decisions, no gaps text.
5. **Open / unprioritised** — one row per idea or concept that needs a decision before it
   becomes work. State: one sentence plus link. Next step: one command.
6. **Tech debt** — one line per gap, shortcut or unfixed finding a sprint left behind that
   needs no decision and no story yet, with its source (sprint review, story). Done items are
   **removed**, not struck through — git keeps the history. Called "Follow-ups worth doing"
   in older roadmaps; `check` renames the heading and keeps the lines.
7. **History** — completed phases, one row per milestone. Nothing else.

Everything that does not fit a budget belongs somewhere else and is linked from here:
findings, gaps, manual residue and criteria covered below the real surface → the sprint's
`review.md`; decisions → the story's `## Decisions (Sprint)` or `sprint.md`; scope and
rationale → the concept. A gap that matters becomes a tech-debt line or a story, never a
paragraph in the roadmap.

## Mode `check` — sync, drift and compaction

1. Read the roadmap.
2. Establish the real state cheaply (Glob/Grep + targeted reads, do not read everything):
   - `<requirements>/*.md` — open stories and their status; the last entry in
     `<requirements>/done/INDEX.md`; stories that no milestone row or open/unprioritised
     row mentions.
   - `<sprints>/` — open sprints (`sprint.md` outside `done/`) and the most recent review
     under `done/`.
   - `<concepts>/` — concepts without a line in the roadmap; concepts whose phase has every
     milestone `done` in the roadmap (→ they belong in `<systems>/`).
3. Correct every deviation directly in the roadmap:
   - A milestone whose stories are all `done` is **`done`** with the date of its last
     sprint — acceptance happened inside the sprint through the tests, there is no separate
     "accepted" state. What a later walk-through finds becomes a new story, never a reopened
     milestone.
   - A phase whose milestones are all done is `done` in the overview; its milestone rows
     move to **History** (one row each), and the next phase becomes the current one.
   - Stories with no home get a row under "Open / unprioritised" (grouped by theme, one row
     per theme, not one per story). A story with `kind: debt` needs no row: it is counted
     with the tech debt.
4. **Age what accumulates — by rule, not by judgement.** Measured without this step: the same
   four red flows listed three times in one roadmap over five sprints, and three concepts
   still "Draft" with their phases done.
   - Tech-debt lines are **not** aged out: deleting an unfixed gap after three sprints is how
     debt used to disappear from view without being paid. They stay and are counted; the
     limit (step 5) is what turns them into work. A line whose cause is gone (the code it
     names no longer exists, a later story fixed it) is removed, with the reason in the report.
   - An entry in the profile's `e2e-quarantine` list older than two sprints (its `since`)
     becomes a story draft (as in `plan` step 3, with `kind: debt`).
   - Every concept whose phase has every milestone `done` in the roadmap (its stories done is
     how a milestone becomes `done`, step 3) moves to `<systems>/` now (`git mv`, update the
     status line), named in the report.
   - Every sprint with `status: done` still outside `<sprints>/done/` moves there now
     (`git mv <sprints>/SNN <sprints>/done/SNN`), named in the report — `/sprint` archives its
     own sprint in the review commit; this catches the ones finished before it did. Repoint the
     roadmap's links to its `review.md` and the relative links inside that `review.md`, which
     now sit one folder deeper. A sprint that is not `done` is never moved.
   - A systems doc older than its module's last story commit is listed in the report as
     stale — best effort.
5. **Stage advice — the advisor.** Cheap and by rule: Glob/Grep and the profile, no build, no
   test run, no subagent. It tracks; it never changes the profile, the stage or a gate — the
   user decides, `/solution-architect` (tech-rules) recommends, `/ai-scrum:setup` applies.
   A profile without the `## Stage` keys uses their defaults: `stage` `live`,
   `tech-debt-limit` 10, `architect-review-every` 20, `architecture-path` `docs/architecture`.
   - **Signals** — what the repository has now, as short names: `ci` (a workflow under
     `.github/workflows/`, `azure-pipelines.yml`, `.gitlab-ci.yml`), `release-workflow` (a
     workflow that tags, publishes or creates a release), `unit-tests` (test files plus a
     runner config or test project), `e2e-config` (`playwright.config.*`, `cypress.config.*`,
     a script or project named e2e or flows), `tag` (a `v*` or semver git tag), `changelog`.
   - **Tech debt** — the lines under `## Tech debt` plus the open stories with `kind: debt`.
   - **Advice** — one line per mismatch between signals, profile and roadmap, each ending in
     the one command that acts on it:

     | When | Advice |
     | --- | --- |
     | `release-workflow` or `tag`, but `release-verify: none` | the release lane exists, sprints do not check it — `/solution-architect` |
     | `unit-tests`, but `test: none` | a test suite exists, no gate runs it — `/ai-scrum:setup` |
     | `e2e-config`, but `e2e: none` | an e2e harness exists, no gate runs it — `/ai-scrum:setup` |
     | stage `prototype` or `mvp`, and `release-workflow` plus `tag` | the project ships — time for a stage review — `/solution-architect` |
     | stage `stable` or `live`, and `core-journeys: none` | no core journeys named, the e2e gate protects nothing in particular — `/solution-architect` |
     | a phase became `done` in this check | phase done — the moment for an architecture look — `/solution-architect` |
     | stories done since the last solution review ≥ `architect-review-every` (not `0`) | <n> stories since the last solution review — `/solution-architect` |
     | tech debt ≥ `tech-debt-limit` | tech debt <n>/<limit> — plan a cleanup sprint — `/roadmap plan debt` |
     | the profile has no `stage` | no stage set, every gate runs as for `live` — `/ai-scrum:setup` |

     Stories since the last review: the `- NNN` lines of `<requirements>/done/INDEX.md` minus
     the `stories-done` value in the frontmatter of the newest
     `<architecture-path>/*-solution-review.md`; with no review, all of them. Several lines that
     end in `/solution-architect` collapse into one that names each reason.
   - **Once, not every sprint.** Write `Stage: <stage> · signals: <list>` and the advice lines
     into `## Stage`. A line already there keeps its `since <SNN>`; a new one gets the id of the
     sprint that is running or was last done; a line whose condition no longer holds is removed.
6. Compact to the budgets: every cell or line that exceeds its budget is cut back to the one
   sentence that carries the status, and the detail is pointed at (linked), not kept. Remove
   tech-debt lines that are done or have become stories. Rewrite "Where we stand" from the real
   state and set "As of".
7. **A roadmap in an older shape** (milestone paragraphs, "Gaps/notes", struck-through items)
   is rebuilt into the seven sections on the first `check`, after an explicit yes from the user
   via `AskUserQuestion`. Say plainly what will not be carried over: the paragraph detail,
   which lives in the sprint reviews and in git history. Follow-ups still worth doing are
   kept as one-liners under `## Tech debt`; everything struck through is dropped. A roadmap
   whose only differences are a missing `## Stage` section and a `## Follow-ups worth doing`
   heading is not an older shape: add the section, rename the heading, keep every line —
   without asking.
8. Report compactly: drift corrected, what was aged, moved or found stale (step 4), what was
   compacted or dropped, state of the current phase, what is waiting unprioritised, the stage
   line with its advice, and `tech debt <n>/<limit>`.

## Mode `plan` — cut the next sprint (together with the user)

1. Precondition: `check` has run in this session (otherwise run `check` first).
2. Propose what comes next — default: the next open milestone of the current phase; name
   alternatives from "Open / unprioritised" and "Tech debt"; at or over the
   `tech-debt-limit`, recommend `plan debt` instead and say why. Real direction
   decisions (which milestone, scope boundaries, deliberate omissions) via `AskUserQuestion`
   with a recommendation — no silent priority assumptions.
3. Cut the chosen milestone (or its first part) into stories:
   - Derive scope from the concept linked in the roadmap, the previous sprint's `review.md`
     (findings, gaps) and the tech-debt lines that fit.
   - Cut small: one sprint = one playable/verifiable increment, 3–6 stories as a guideline.
   - One file per story from `<requirements>/_TEMPLATE.md` (`status: draft`, next free id per
     the profile's `story-id-format`, determined from `done/INDEX.md` + the open stories):
     requirement + acceptance criteria from the user's perspective, **numbered `AC1`, `AC2`,
     … and each one observable** — refine has to map every single one to an automated test, so
     a criterion phrased as an intention ("the screen feels calm") cannot be accepted by
     anyone and is cut as a fact instead ("the screen shows exactly one accent colour").
     Deliberately open decisions as concrete questions in `## Open Questions` (resolved by
     `/sprint` in its clarification round). **No** plan/deliverables and **no** test mapping —
     that is refine's job.
   - Decisions taken at the cut go into `sprint.md` (goal, scope, deliberate omissions) and
     the story files — not into the roadmap.
4. Create `<sprints>/<next free sprint id>/sprint.md` from the template: goal, stories in
   build order, `status: planned`, `milestone:` line.
5. Update the roadmap: the milestone row gets the sprint link and status `planned`; a
   tech-debt line that became a story is removed; "Where we stand" names the sprint as the
   next step.
6. Show the user the cut (sprint goal + one sentence per story) for correction. Then the user
   starts `/sprint <id>` themselves.

## Mode `plan debt` — a cleanup sprint

`plan` with the tech debt as the milestone:

1. Precondition as in `plan`. Collect the debt: every `## Tech debt` line and every open story
   with `kind: debt`.
2. Group the lines by root cause and module — five lines about one flaky harness are one
   story, not five. Propose the cut via `AskUserQuestion` with a recommendation: which groups
   go in, which stay. Default: the riskiest and the oldest first, enough to bring the count
   back to about half the limit, 3–6 stories as in `plan`.
3. One story draft per group, `kind: debt`: the lines it absorbs quoted as the requirement,
   acceptance criteria as observable facts ("the suite passes three runs in a row with the
   retry removed", not "the tests are stable"). Existing `kind: debt` stories are scheduled
   as they are.
4. `sprint.md` with the goal `tech-debt cleanup` and `milestone: tech debt`. No milestone row
   in the roadmap: "Where we stand" names the sprint, and the lines it absorbed are removed
   from `## Tech debt`.
5. Show the cut as in `plan` step 6.

## Rules

- Do not commit, do not push. No implementation, no refine — only the roadmap, story drafts
  and `sprint.md`. Never the profile: stage advice is advice.
- Milestone granularity, table rows, one sentence: never copy story status lists, findings or
  decisions into the roadmap. If you are about to write a second sentence into a cell, link
  instead.
- History is deleted here, not preserved: done tech-debt lines go, struck-through text
  goes, done phases collapse to one row per milestone. Git and the sprint reviews are the archive.
- Concepts stay timeless (what/why) — when/status lives only in the roadmap.
- Write generated artifacts in the profile's `doc-language`; keep the existing language of
  files you are only editing.
