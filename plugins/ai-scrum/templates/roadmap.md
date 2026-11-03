# Roadmap

As of: <YYYY-MM-DD>. One screen: where the project stands, what was done recently, what comes
next. Detail lives where it is produced — sprint reviews, story files, concepts — and this file
links to it. Maintained by `/sprint`, `/concept` and `/roadmap`; the rules are in
`.claude/commands/roadmap.md`.

## Where we stand

<Max. five lines, plain sentences, rewritten every time — not appended to:>
<— which phase and milestone we are in, and what is being built right now (sprint link)>
<— what was finished last (last one or two milestones, with dates)>
<— what comes next, as a concrete step (`/sprint S05`, `/roadmap plan` for M3, `/refine 042`)>
<— anything waiting on the user (a merge, a decision, a question), or "nothing"; this line
   is dropped when there is nothing>

## Stage

Stage: <stage from the profile> · signals: <what the repository has, e.g. ci, unit-tests, e2e-config, release-workflow, tag — or none>

<Advice from `/roadmap check`, one line each, only while it is open. Removed once followed or
once the profile no longer contradicts it. No advice: this paragraph is the whole section.>
- <what to do and why, one line> — `<command>` · since <SNN>

## Phase overview

| Phase | Goal | Milestones | Status |
| --- | --- | --- | --- |
| 1 — <name> | <what is true at the end of this phase, one sentence> | <done>/<total> | ▶ **in progress** |
| 2 — <name> | <…> | 0/? | planned |

## Current phase: 1 — <name>

Concept: [concepts/<concept>.md](concepts/<concept>.md).

| M | Milestone | Status | Sprints | Note |
| --- | --- | --- | --- | --- |
| M1 | <name, one line> | done <YYYY-MM-DD> | [S01](sprints/done/S01/review.md) | <one sentence at most, or empty> |
| M2 | <name> | ▶ in progress | [S02](sprints/S02/sprint.md) | <e.g. "042 blocked on a user decision"> |
| M3 | <name> | planned | | |

## Open / unprioritised

Ideas and concepts that need a decision before they become work. One line each.

| Topic | State | Next step |
| --- | --- | --- |
| <concept or idea> | <one sentence + link, e.g. concept drafted (link)> | <one command, e.g. `/roadmap plan`> |

## Tech debt

What a sprint left behind that needs no decision and no story yet: a known gap, a shortcut, a
finding not fixed. One line each, with where it came from. Done items are removed, not struck
through. These lines plus the open stories with `kind: debt` count against the profile's
`tech-debt-limit`; at the limit, `/roadmap plan debt` cuts a cleanup sprint from them.

- <what, one line> — <source: [S03 review](sprints/done/S03/review.md), story 017, …>

## History

Completed phases, one line per milestone; nothing else.

| Phase | M | Milestone | Done | Sprints |
| --- | --- | --- | --- | --- |
