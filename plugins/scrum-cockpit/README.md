# scrum-cockpit

A Claude Code **mod** for projects that run [ai-scrum](../ai-scrum/): the state of the project's
scrum workflow beside the chat, live, with buttons that start the next step.

## What it shows

**A band above the prompt** — only in a project that has ai-scrum, or where an update is due:

- the current milestone, the sprint's phase and progress (`S14 Refine 3/12`, or `S14 Build 4/12 ·
  026 D4/5` with the story in focus and its step), and how many subagents are running;
- an update hint when the project's ai-scrum or tech-rules copy is older than the installed
  plugin, with an **Update** button that runs `/ai-scrum:setup` or `/tech-rules:setup`, and a
  hint when the installed plugin is older than the marketplace (run `/plugin` and update it
  yourself; a mod cannot);
- **Overview** opens the pane, **Hide** hides the band for the session.

**`/scrum` opens the pane**, a stack of cards whose middle follows the phase `/sprint` is in:

| Card | Content | Buttons |
| --- | --- | --- |
| Heading | the roadmap's phase, the current milestone and sprint, the sprint's steps (Clarify → Refine → Build → Gate → Review → Release) and its progress, as a ring where the surface draws one; update hints and the other "Where we stand" lines | Update (setup) |
| Refinement | every story of the refine round still refining, longest-running first, with its agent's run time and current tool call; at most eight rows, then a count; the refined ones as ids | Resume when nothing runs |
| Now building | the story in focus: its deliverables, verify and review with the current step outlined and its start time, the agents on it as a tree (builder, then the agent it spawned), the last trail line and its age | Resume when nothing runs |
| Sprint | in build, gate and review: the stories as a row of chips (✓ done, ● focus), the last finished one and the time left at the average so far | |
| Planned / clarify / gate / review | what the sprint waits for, its stories | Start / Resume (`/sprint SNN`) |
| Releasable | while `/sprint` phase 4 or `/release-check` runs: the step (roadmap check, release check), its start and the log to watch — a finished sprint stays in focus until its phase 4 ends; after it: the verdict (`releasable: yes · … · next release 1.2.0 (minor)`, green, red for NO, amber for UNVERIFIED) and the record line (`record: 3 green cycles in a row · 1 missed · …`), each **missed** verdict (yes, then GitHub red) in amber, in the band as well | Resume (`/sprint SNN`) when phase 4 stopped |
| Agents | in refinement, a count, the models and the longest runner; otherwise the running agents no card above shows; the last five finished when no sprint runs | press a running one to open its transcript |
| Waiting on you | the "Waiting on …" items from "Where we stand" | |
| Next | milestones no sprint covers, open stories no open sprint lists, open topics, follow-ups | Plan (`/roadmap plan`), Refine (`/refine NNN`) or Build (`/build NNN`) |
| | | Roadmap check, Release check (`/release-check`, hidden while one runs), New concept…, Refresh |

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
amber, and a profile without the keys says that setup offers them.

An agent with no tool call for three minutes is drawn amber as *quiet*; a trail that has been silent
for fifteen minutes turns amber too, the threshold `/sprint` itself uses to tell you.

**Model and effort.** A button runs the project's command exactly as if you typed it, so the
model and effort are the ones in that command's frontmatter (`.claude/commands/<name>.md`) — the
cockpit keeps no second copy of them. The button label shows them, e.g. `Build · sonnet/medium`.

## Where the data comes from

Nothing is stored in the project beyond what the settings pane writes. The cockpit reads, on session start, after every main turn,
after a write to the docs and every 15 seconds while a sprint or an agent runs:

- `.claude/ai-scrum.md` for `requirements-path`, `sprints-path`, `roadmap-path` and the `## Branching` values;
- `.git/refs/heads` and `.git/packed-refs` for the local branches the settings pane offers;
- the roadmap's "Where we stand", "Current phase" (its milestone table, or one `### M… — …`
  heading per milestone in roadmaps from before ai-scrum 4), "Open" and "Follow-ups" sections;
- each open sprint's `sprint.md` frontmatter and story list, and its `progress.md` trail, from
  whose lines (`refine · … · started`, `026 · D4 … · started`, `026 · verify`, `026 · review 1`,
  `026 · story · done`, `gate · …`) come the phase, the story in focus, its step and the story times;
- each open story's frontmatter and its `## Deliverables` checkboxes;
- `.git/ai-scrum/trail.md` (ai-scrum ≥ 4.10), the trail `/sprint` phase 4 and `/release-check`
  write once `progress.md` is committed — `roadmap-check · started|done`, `release-check ·
  started · watch <log>`, `release-check · done · releasable: …` — for the phase-4 step, its log
  and the last verdict; and `.git/ai-scrum/release-checks.jsonl`, the verdicts with what GitHub
  later did with them, for the record line. Both live inside `.git`: never committed;
- the profile's `## Release` keys, shown (not edited) in the settings pane;
- `.claude/ai-scrum.lock` and `.claude/tech-rules.lock` for the project's versions, and Claude
  Code's own `plugins/installed_plugins.json` and the marketplace's cached `marketplace.json` for
  the installed and the latest one. "Latest" is as fresh as the marketplace's last refresh.

The running agents come from the session itself (each subagent's spawn, model requests and tool
calls), not from files — that is the part the sprint's files cannot show. An agent belongs to the
story whose id its description names, else its prompt, else to its parent's story: that is how a
deliverable agent that names no story still lands under the builder that spawned it.

## Install

From a terminal session:

```
claude plugin install scrum-cockpit@hantsch --scope user
```

It is active at once, with no reload. Mods run in the Claude Code terminal, the local sessions of
the desktop app and the VS Code extension.

## What it does not do

- It changes one file, and only from the settings pane: the `## Branching` lines of
  `.claude/ai-scrum.md`, each rewritten in place with its comment and every other byte kept. Every
  other button runs a command you could have typed; the command does the work.
- It does not run `/plugin update` — that stays your step.
- It reads the template layout plus the drift seen in real projects (milestone ids like `11.5`,
  an `accepted` status, a roadmap row that still says `planned` while its sprint runs). A roadmap
  far from that shows fewer milestones; `/roadmap check` brings it back to the template.

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
