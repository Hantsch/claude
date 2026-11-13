# scrum-cockpit — reference

The details behind the [README](README.md): every row, card and button, where each number comes
from, and what the cockpit never does. For "what do I press when", the README is enough.

- [What it shows](#what-it-shows) — band, pane, settings pane
- [Where the data comes from](#where-the-data-comes-from)
- [Where it runs](#where-it-runs)
- [What it does not do](#what-it-does-not-do)
- [Known gaps](#known-gaps)
- [Developing](#developing)

## What it shows

**A band above the prompt** — only in a project that has ai-scrum, or where an update is due:

- the current milestone, the sprint's phase and progress (`S14 Refine 3/12`, or `S14 Build 4/12 ·
  026 D4/5` with the story in focus and its step), how many subagents are running and how long the
  oldest has run; outside a sprint, the last release verdict (`releasable: yes`) or a running
  `Roadmap check` / `Release check`;
- an update hint when the project's ai-scrum or tech-rules copy is older than the installed
  plugin, with an **Update** button that runs `/ai-scrum:setup` or `/tech-rules:setup`, and a
  hint when the installed plugin is older than the marketplace (run `/plugin update` and
  `/reload-plugins` yourself; a mod cannot); `ai-scrum docs found but no lock file`, with an
  **Update** button, when the project has ai-scrum's docs but no `.claude/ai-scrum.lock`;
- an amber line when release verdicts were missed (`release check missed 1× — said yes, then
  GitHub went red`);
- one amber line when tech debt has reached its limit or a solution-architect review is due
  (`⚠ tech debt 10/10 · architect review due (21 stories)`), without a button: the pane has it;
- **Overview** opens the pane, **Hide** hides the band for the session. The band steps aside
  while a survey is shown.

**`/scrum` opens the pane.** When no sprint runs, it is one card of short rows — a number
against its threshold, and a button only where something is due:

```
✻ ai-scrum 4.13.0 ✓
Stage      mvp · 1 advice  ▸
Phase      1 · The King moves in · 4/6 milestones
Release    not tracked (stage mvp)
Tech debt  7 / 10  ███████░░░
Architect  14 / 20  ███████░░░  stories since review (2026-10-12)
Backlog    23 open · 4 ready · 6 unplanned  ▸
Next       S10 planned · 5 stories                     [Start S10]
```

| Row | Content | Button |
| --- | --- | --- |
| Stage | the profile's `stage` (`live (default)` without the key) and the advice count of the roadmap's `## Stage`; unfolded, the signals and each advice | each advice's command |
| Phase | the roadmap's current phase and its milestones done | |
| Release | the last verdict in a few words (`✓ yes · 1.2.0`, `✗ NO — …`, `UNVERIFIED`), or `not tracked (stage mvp)` drawn dim; the record and each missed verdict in amber, only when one was missed | |
| Tech debt | the roadmap's `## Tech debt` items plus the open `kind: debt` stories against `tech-debt-limit`: amber from 80 %, red at the limit; a limit of 0 shows `N · no limit`, no bar, never due | Plan tech-debt cleanup (`/roadmap plan debt`), at the limit |
| Architect | stories done since the last solution-architect review against `architect-review-every`, same colors; hidden when that is 0 | Architect review (`/solution-architect`) when due; without the skill, `needs tech-rules (/tech-rules:setup)` |
| Backlog | open, ready and unplanned stories, folded; unfolded, the milestones and stories no sprint covers and the open topics | Plan (`/roadmap plan`), Refine (`/refine NNN`), Build (`/build NNN`), or Resume for a story already in progress |
| Next | the planned sprint, or none | Start (`/sprint SNN`) or Plan next sprint (`/roadmap plan`) |

While a sprint or a phase-4 step runs, the heading keeps the Stage and Phase rows and the
cards below follow the phase `/sprint` is in:

| Card | Content | Buttons |
| --- | --- | --- |
| Heading | the version, the Stage and Phase rows, the current milestone and sprint, the sprint's steps (Clarify → Refine → Build → Gate → Review → Release) and its progress, as a ring where the surface draws one; update hints | Update (setup) |
| Refinement | every story of the refine round still refining, longest-running first, with its agent's run time (a bar that fills at 15 minutes) and current tool call; at most eight rows, then a count; the refined ones as ids | Resume when nothing runs |
| Now building | the story in focus (`story N of M`; `Just finished` once it is done): its deliverables, verify and review with the current step outlined and its start time, the builder's run time against the sprint's average per story, the agents on it as a tree (builder, then the agent it spawned; at most three, then `+N more`), the last trail line and its age; an amber border when the story is blocked. Its title unfolds the story's Requirement and Acceptance Criteria | Resume when nothing runs; press an agent to open its transcript |
| Sprint | in build, gate, review and release: the stories as a row of chips (✓ done, ● focus), the last finished one and the time left at the average so far | |
| Planned / clarify / gate / review | what the sprint waits for: in planned and clarify its stories, in gate the suite running and its start, in review `Sprint review`; the last trail line while the sprint is live | Start (`/sprint SNN`) when planned, Resume when it stopped |
| Releasable | while `/sprint` phase 4 or `/release-check` runs: the step (roadmap check, release check), its start and the log to watch — a finished sprint stays in focus until its phase 4 ends; after it: the verdict (`releasable: yes · … · next release 1.2.0 (minor)`, green, red for NO, amber for UNVERIFIED) and the record line (`record: 3 green cycles in a row · 1 missed · …`), each **missed** verdict (yes, then GitHub red) in amber, in the band as well; `releasable: not tracked` (the stage skips the check) dim | Resume (`/sprint SNN`) when phase 4 stopped |
| Agents | in refinement, a count, the models and the longest runner; otherwise the main session's activity and the running agents no card above shows; the last five finished when no sprint runs; no card when there are none | press a running one to open its transcript |
| Foot | `Sprints N open · N done · Stories N open · N done` | Roadmap check (`/roadmap check`); Release check (`/release-check` — hidden while one runs, and when the project's `release-check.md` has no `model:`); New concept… (only fills `/concept ` into the prompt); Settings; Refresh |

Without ai-scrum in the project, the pane and the settings pane offer **Set up ai-scrum**
(`/ai-scrum:setup`) instead.

**`/scrum settings`** (or **Settings** at the foot of the pane) opens a second pane with the
profile's branching: the base branch (picked from the repository's local branches, or typed),
whether `/sprint` cuts a sprint branch or commits directly on the base (`sprint-branch`), the sprint
branch's name, commit per story, and the protected branches. A pick is written to
`.claude/ai-scrum.md` at once; `/sprint` reads it at its next start. While a sprint is in progress
the values are shown but locked, and a base that is both protected and committed on directly is
flagged, because `/sprint` refuses to start on it. The heading card of the main pane shows the
same in one line: `⎇ dev → sprint/{id}` or `⎇ dev · commits directly`. Below the branching, the
profile's `## Release` keys (release branch, release check, plan, dry run, changelog and commit
style) are shown, not edited — `/ai-scrum:setup` asks about them; `release-verify: none` is drawn
amber, and a profile without the keys says that setup offers them. A value with a line break or a
`<` is not written. On a surface without input fields the settings pane is read-only. **Cockpit**
goes back to the main pane.

An agent with no tool call for three minutes is drawn amber as *quiet*; a trail that has been silent
for fifteen minutes turns amber too, the threshold `/sprint` itself uses to tell you.

**Model and effort.** A button runs the project's command exactly as if you typed it, so the
model and effort are the ones in that command's frontmatter (`.claude/commands/<name>.md`) — the
cockpit keeps no second copy of them. The button label shows them, e.g. `Build · sonnet/medium`;
a command without a `model:` key shows no model, and an `effort:` alone is not shown either.

## Where the data comes from

Nothing is stored in the project beyond what the settings pane writes. The cockpit reads on
session start, after every main turn, 0.8 s after a tool call that touches the scrum files (a read
or write under the docs paths, or a shell command naming `progress.md`, the roadmap, `INDEX.md`, a
`.lock` or a `git mv`), every 15 seconds while a sprint, an agent or a release check runs, and when
you open a pane, press Refresh or save a setting:

- `.claude/ai-scrum.md` for `requirements-path`, `sprints-path`, `roadmap-path`, the `## Branching`
  values and the `## Stage` keys — `stage` (missing: `live`), `tech-debt-limit` (10),
  `architect-review-every` (20, 0 = off) and `architecture-path` (`docs/architecture`);
- the frontmatter (`model`, `effort`) of `.claude/commands/{refine,build,sprint,roadmap,concept,release-check}.md`
  for the button labels;
- `.git/refs/heads` and `.git/packed-refs` for the local branches the settings pane offers;
- the roadmap's "Current phase" (its milestone table, or one `### M… — …` heading per milestone
  in roadmaps from before ai-scrum 4), "Open" and "Tech debt" ("Follow-ups worth doing" in older
  roadmaps) sections, and "Stage": its `Stage: mvp · signals: …` line and the advice bullets
  ``- <advice> — `/command` · since S07`` that `/roadmap check` writes. "Where we stand" is not
  shown;
- each open sprint's `sprint.md` frontmatter and story list (for a sprint in phase 4, the one in
  `<sprints>/done/<SNN>/`), and its `progress.md` trail and that file's age, from
  whose lines (`refine · … · started`, `026 · D4 … · started`, `026 · verify`, `026 · review 1`,
  `026 · story · done`, `gate · …`) come the phase, the story in focus, its step and the story times;
- each open story's frontmatter (`kind: debt` counts as tech debt), its `## Deliverables`
  checkboxes, and its `## Requirement` and `## Acceptance Criteria` for the unfolded title;
- the listings of `<sprints>/done` and `<requirements>/done` for the done counts;
- `<requirements>/done/INDEX.md`, whose `- NNN — …` lines count the stories done, and the newest
  `<architecture-path>/<YYYY-MM-DD>-solution-review.md`, whose `date` and `stories-done` that count is
  measured against (no review yet: all of them, "never reviewed"); and whether
  `.claude/skills/solution-architect/SKILL.md` exists, the skill tech-rules installs, for the
  Architect review button and its model and effort;
- `.git/ai-scrum/trail.md` (ai-scrum ≥ 4.10), the trail `/sprint` phase 4 and `/release-check`
  write once `progress.md` is committed — `roadmap-check · started|done`, `release-check ·
  started · watch <log>`, `release-check · done · releasable: …` — for the phase-4 step, its log
  and the last verdict, `releasable: not tracked · stage mvp` when `/sprint` skipped the check; and `.git/ai-scrum/release-checks.jsonl`, the verdicts with what GitHub
  later did with them, for the record line. Both live inside `.git`: never committed;
- the profile's `## Release` keys, shown (not edited) in the settings pane;
- `.claude/ai-scrum.lock` and `.claude/tech-rules.lock` for the project's versions, and Claude
  Code's own `plugins/installed_plugins.json` and the marketplace's cached `marketplace.json`
  (found through `plugins/known_marketplaces.json`) for the installed and the latest one, under
  `CLAUDE_CONFIG_DIR`, else `~/.claude`. "Latest" is as fresh as the marketplace's last refresh.

The running agents come from the session itself (each subagent's spawn, model requests and tool
calls), not from files — that is the part the sprint's files cannot show. An agent belongs to its
parent's story, else to the first open story or sprint id its description names, else the first
its prompt names: that is how a deliverable agent that names no story still lands under the builder
that spawned it.

## Where it runs

Mods draw in the Claude Code terminal, the desktop app's local sessions and the VS Code extension
(from 2.1.299). A cloud session draws nothing, and WSL sessions in the desktop app load no plugins.

## What it does not do

- It changes one file, and only from the settings pane: the `## Branching` lines of
  `.claude/ai-scrum.md`, each rewritten in place with its comment and every other byte kept. Every
  other button runs a command you could have typed; the command does the work.
- It does not run `/plugin update` — that stays your step.
- It reads the template layout plus the drift seen in real projects (milestone ids like `11.5`,
  an `accepted` status, a roadmap row that still says `planned` while its sprint runs). A roadmap
  far from that shows fewer milestones; `/roadmap check` brings it back to the template.

## Known gaps

- **Design (ai-scrum ≥ 4.12)** is not read: no `## Design` keys, no design reports, and no button
  for `/design-review`.

## Developing

Run a working copy without installing it, with hot reload in an interactive session:

```
claude --plugin-dir plugins/scrum-cockpit
```

Check and test it:

```
claude plugin validate plugins/scrum-cockpit
claude plugin test plugins/scrum-cockpit
```

`hooks/scan.ts` reads the files and derives what the views show; `hooks/register.tsx` holds the
hooks, the band and the pane; `types/index.d.ts` declares the session state. The engine lays its
API types into `.claude-plugin/types/` when it loads the folder (ignored by git), which the
top-level `tsconfig.json` extends.
