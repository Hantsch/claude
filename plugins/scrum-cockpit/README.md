# scrum-cockpit

A Claude Code **mod** for projects that run [ai-scrum](../ai-scrum/): the state of the project's
scrum workflow beside the chat, live, with buttons that start the next step.

## What it shows

**A band above the prompt** — only in a project that has ai-scrum, or where an update is due:

- the current milestone, the sprint and how many of its stories are done, and the subagents that
  are running with what they are doing right now;
- an update hint when the project's ai-scrum or tech-rules copy is older than the installed
  plugin, with an **Update** button that runs `/ai-scrum:setup` or `/tech-rules:setup`, and a
  hint when the installed plugin is older than the marketplace (run `/plugin` and update it
  yourself; a mod cannot);
- **Overview** opens the pane, **Hide** hides the band for the session.

**`/scrum` opens the pane:**

| Section | Content | Buttons |
| --- | --- | --- |
| Versions | project, installed and marketplace version of ai-scrum and tech-rules | Update (setup) |
| Phase | the roadmap's current phase and its "Where we stand" lines | |
| Milestones | the open ones and the last finished one; ▶ marks the current one | Plan (`/roadmap plan`) for a milestone no sprint covers |
| Sprint | the running or next sprint, its stories with status and deliverable count, the last `progress.md` line | Start / Resume (`/sprint SNN`) |
| Agents | running subagents: task, type, model and effort, run time, the tool call they are on; the last five finished | press a running one to open its transcript |
| Stories in no sprint | open stories no open sprint lists | Refine (`/refine NNN`) for a draft, Build (`/build NNN`) otherwise |
| Open | the roadmap's open topics and the number of follow-ups | Roadmap check, New concept…, Refresh |

**Model and effort.** A button runs the project's command exactly as if you typed it, so the
model and effort are the ones in that command's frontmatter (`.claude/commands/<name>.md`) — the
cockpit keeps no second copy of them. The button label shows them, e.g. `Build · sonnet/medium`.

## Where the data comes from

Nothing is stored in the project. The cockpit reads, on session start, after every main turn,
after a write to the docs and every 15 seconds while a sprint or an agent runs:

- `.claude/ai-scrum.md` for `requirements-path`, `sprints-path` and `roadmap-path`;
- the roadmap's "Where we stand", "Current phase" (its milestone table, or one `### M… — …`
  heading per milestone in roadmaps from before ai-scrum 4), "Open" and "Follow-ups" sections;
- each open sprint's `sprint.md` frontmatter and story list, and its `progress.md`;
- each open story's frontmatter and its `## Deliverables` checkboxes;
- `.claude/ai-scrum.lock` and `.claude/tech-rules.lock` for the project's versions, and Claude
  Code's own `plugins/installed_plugins.json` and the marketplace's cached `marketplace.json` for
  the installed and the latest one. "Latest" is as fresh as the marketplace's last refresh.

The running agents come from the session itself (each subagent's spawn, model requests and tool
calls), not from files — that is the part the sprint's files cannot show.

## Install

From a terminal session:

```
claude plugin install scrum-cockpit@hantsch --scope user
```

It is active at once, with no reload. Mods run in the Claude Code terminal and in the local
sessions of the desktop app; the VS Code extension does not load mods at the time of writing.

## What it does not do

- It changes no file. Every button runs a command you could have typed; the command does the work.
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
