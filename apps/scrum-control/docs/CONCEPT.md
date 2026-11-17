# Scrum Control — concept

A Windows tray app that answers one question across every project you have open:
**is a sprint running, where does it stand, and does any project or session need me?**

It is a fork of [claude-control](https://github.com/Hantsch/claude-control) 1.1.1 (copied
2026-11-17). claude-control stays a standalone, generic session monitor; Scrum Control is the
same session monitor plus the ai-scrum state of each project — the
[scrum-cockpit](../../../plugins/scrum-cockpit/) mod's view, lifted out of the single session
into a cross-project overview. Everything claude-control documents in
[CLAUDE-CONTROL-CONCEPT.md](CLAUDE-CONTROL-CONCEPT.md), [RESEARCH.md](RESEARCH.md) and
[IMPLEMENTATION.md](IMPLEMENTATION.md) still holds for the session part unless this file says
otherwise.

## 1. Identity — both apps must run side by side

| | claude-control | Scrum Control |
| --- | --- | --- |
| package name | `claude-control` | `scrum-control` |
| product name | Claude Control | Scrum Control |
| appId / AppUserModelId | `solutions.aidu.claude-control` | `solutions.aidu.scrum-control` |
| data dir | `%APPDATA%\claude-control` | `%APPDATA%\scrum-control` |
| toast URI scheme | `claude-control` | `scrum-control` |
| portable exe | `ClaudeControl-<v>-portable.exe` | `ScrumControl-<v>-portable.exe` |
| default global hotkey | `Ctrl+Alt+C` | `Ctrl+Alt+S` |
| releases | GitHub `Hantsch/claude-control` | GitHub `Hantsch/claude`, tags `scrum-control-v<semver>` |

Nothing either app writes (settings, caches, protocol registration, autostart entry, update
stage) may collide with the other's.

## 2. Hosts: Windows and WSL

The user runs Claude Code in two ways: the VS Code extension on Windows, and the `claude` CLI
inside a WSL terminal of a Windows VS Code window. Both must be seen.

- **Roots.** The Windows root is `~/.claude` (or `CLAUDE_CONFIG_DIR`, or the setting). WSL roots
  are discovered: `wsl.exe -l --running -q` (UTF‑16LE output) lists the *running* distros —
  never touch a stopped distro, reading `\\wsl.localhost\<distro>` would boot it. Skip
  `docker-desktop*`. For each, every `//wsl.localhost/<distro>/home/*/.claude` (and
  `/root/.claude`) that has a `sessions/` or `projects/` directory is a root. Re-detect every
  60 s. Node reads these UNC paths fine with forward slashes (verified:
  `//wsl.localhost/Ubuntu/home/hantsch/.claude/sessions`).
- **Session origin.** Every live session carries `host: 'windows' | 'wsl:<distro>'`; the UI shows
  a small `WSL` badge.
- **Liveness in WSL.** A WSL registry entry's `pid` is a Linux pid. Alive =
  `//wsl.localhost/<distro>/proc/<pid>/stat` exists, and when `procStart` is present it equals
  field 22 (`starttime`) of that file (verified: `procStart: "631299"` style values). No
  `wsl.exe` process per tick.
- **Paths.** A WSL cwd `/mnt/<drive>/<rest>` maps to `<DRIVE>:\<rest>`; any other Linux path to
  `//wsl.localhost/<distro>/<path>`. Project identity uses the mapped Windows path, so a WSL
  session in `/mnt/c/development/X` and a Windows session in `c:\development\X` are the **same
  project**. Transcripts are read through the UNC path.
- **Watching.** File-system events over the WSL 9P share are unreliable; WSL roots are polled
  on the existing tick (5 s), Windows roots keep chokidar.
- **Jump to session.** A WSL session has no Windows process chain; jumping focuses the VS Code
  window of its project (§3).

## 3. Projects — what the overview shows

**Open VS Code windows define the overview.**

- An *open window* is an IDE lock `<root>/ide/*.lock` (`pid`, `workspaceFolders`, `ideName`;
  never read `authToken`) whose process is alive, cross-checked — where window enumeration is
  available — against a visible top-level window of that process whose title contains the
  workspace folder's name (titles may carry `[WSL: Ubuntu]` or `(Profile)` decorations;
  claude-control's `windowProbe`/`win32` already handle that). One VS Code process owns one
  window per workspace, so the pid alone is not enough.
- Fallback, for a window whose Claude extension did not write a lock: a top-level window of a
  `Code.exe` process whose title contains the folder name of a **known** project path (session
  cwds and project slugs of all roots). Known paths only — nothing is guessed from a title.
- A project *has scrum* when scan.ts says so (`hasScrum`: the project has ai-scrum's profile or
  lock).

Sections, in this order:

1. **Scrum projects** — `hasScrum` and (an open window *or* at least one live session). Shown even
   with no session running.
2. **Other** — not `hasScrum`, and at least one live session. A non-scrum window with no session
   is not shown at all.

A session belongs to the project whose folder contains its (mapped) cwd, the longest match
winning; a session in no open folder is its own project keyed by its cwd. A project can be
hidden in Settings (`projects.hidden`, by project key); hidden projects still count nowhere.

## 4. Scrum state per project

- **One parser.** The ai-scrum file formats are parsed by
  `plugins/scrum-cockpit/hooks/scan.ts` in this repository, imported by relative path — there is
  exactly one copy of that parser. The app supplies a Node-fs `Reader`; `configDir` is the
  Windows root. If scan.ts must change to compile here, the change is type-level only and the
  mod's own tests (`claude plugin test plugins/scrum-cockpit`) must still pass.
- **Read-only.** The app never writes into a project.
- **Refresh.** On start; on a debounced (500 ms) change under the project's `.claude/` profile
  or sprints path (Windows-side projects; WSL-only paths are polled); every 15 s while that
  project's sprint, release check or a session in it runs; else every 60 s.
- **Summary** (`ProjectScrumSummary`, the one shape main and renderer share):
  - ai-scrum version in the project, current milestone, phase name and milestones done/total;
  - active sprint: id, title, `SprintPhase`, stories done/total, focus story id + title, its
    `StoryStage` and step, `stepAt`, trail age (`trailAt`), average minutes per story and an
    estimate of time left;
  - `releasing` sprint and release state/verdict (`yes | NO | UNVERIFIED | not tracked`);
  - next planned sprint; tech debt count/limit (`isDebtDue`); architect count/every
    (`isArchitectDue`); backlog open / ready / unplanned; update hints (`updateHints`);
  - **attention** flags: `stalled` (sprint in progress, trail silent ≥ 15 min, no session of
    the project `working`), `blocked` (focus story stage `blocked`), `releaseNo` (verdict NO),
    `releaseMissed` (record has a missed verdict).

## 5. Tray

The tray shows **sprints, not sessions**.

| Tile | When |
| --- | --- |
| `idle` — thin hollow ring | no sprint running in any shown project |
| `sprint` — disc with a white core (claude-control's `working` shape, sprint colour) | ≥ 1 sprint in progress, nothing needs you |
| `attention` — notched amber disc (claude-control's `waiting` shape) | any scrum attention flag, or any session `waiting` (needs you) |

The overlay badge counts projects needing attention (a project with a waiting session counts
once). Tooltip: one line per running sprint, `S14 Build 4/12 · claude`, else `No sprint running`.
Shapes, the light/dark palette and the exact-pixel rendering are claude-control's; only the
mapping changes.

## 6. Popover (left click)

```
┌ Scrum Control ───────────────────────────────────┐
│ SCRUM PROJECTS                                    │
│ ● claude        S14 Build 4/12 · 026 D4/5 · 12m   │
│   ▓▓▓▓▓░░░░░░░  M3 Login     ●2 working  WSL      │
│ ◐ Hantsch-MMO   S03 Refine 2/6 · ⚠ stalled 18m    │
│ ○ wow-market    no sprint · next S10 planned      │
│ OTHER                                             │
│ ● Frontend-Scotty            ●1 done              │
└───────────────────────────────────────────────────┘
```

- A scrum row: status dot (project's worst state), name, sprint line (or `no sprint · next SNN
  planned` / `no sprint`), progress bar, current milestone, session counts by status, `WSL`
  badge when a session runs there. Attention in amber text (`⚠ stalled 18m`, `⚠ blocked 026`,
  `✗ releasable: NO`).
- Expanding a row shows the project's sessions with claude-control's existing session rows and
  drill-down, and a compact scrum block (release verdict, tech debt, architect, next sprint).
- *Other* rows behave like claude-control's project groups.
- Each project row has **Open window** (focuses its VS Code window); session rows keep **Jump**.
- Keyboard navigation and hidden-session handling stay as they are.

## 7. Main window

Tabs: **Projects** (new, first), Sessions, History, Settings.

- **Projects:** one card per scrum project — the cockpit's idle rows (Stage, Phase, Release,
  Tech debt with bar, Architect with bar, Backlog, Next) and, while a sprint runs, the phase
  stepper (Clarify → Refine → Build → Gate → Review → Release), the stories as chips (✓ done,
  ● focus), the focus story with its stage and step and start time, time left at the average,
  and the last trail line with its age. No buttons that run commands — the app cannot type into
  a session. **Open window** and **Open folder** (Explorer) only.
- **Settings:** additions — WSL on/off with the detected roots listed (Diagnostics), hidden
  projects (unhide), scrum notification toggles.

## 8. Notifications

claude-control's session toasts stay. Added, each with its own toggle, deduplicated per
(project, event, sprint, story), clicking focuses the project's window:

| Event | Default |
| --- | --- |
| sprint started (phase leaves `planned`) | on |
| story done | off |
| sprint reached review / done | on |
| sprint stalled (§4) | on |
| story blocked | on |
| release verdict written (`yes` / `NO` / `UNVERIFIED`) | on |

The first scan after app start establishes the baseline and announces nothing.

## 9. Updates and releases

- **Self-update** works as in claude-control (opt-in, daily, SHA256-verified, staged, swapped on
  next start), but the source is `Hantsch/claude`, which also publishes plugin releases: list
  `GET /repos/Hantsch/claude/releases?per_page=100`, keep non-draft, non-prerelease releases
  whose tag is `scrum-control-v<semver>`, take the highest version. Assets
  `ScrumControl-<v>-portable.exe` and `SHA256SUMS.txt`.
- **Release lane** (in this repository's `.github/workflows/`): on push to `main` touching
  `apps/scrum-control/**`, `plugins/scrum-cockpit/hooks/scan.ts` or
  `plugins/scrum-cockpit/types/index.d.ts`; Windows runner; bump from the Conventional-Commit
  subjects of commits touching those paths since the last `scrum-control-v*` tag; notes from
  `apps/scrum-control/CHANGELOG.md` `## Unreleased`; commits `chore(release): scrum-control
  <v> [skip ci]`, tags `scrum-control-v<v>`, creates the GitHub release with the exe and
  `SHA256SUMS.txt`. Shares the concurrency group of the plugin release so the two never push at
  once. A `workflow_dispatch` input `version` makes the first release (`0.1.0`).
- **PR lane:** on PRs and pushes touching the same paths: `npm ci`, typecheck, `npm test`.

## 10. Not in scope

- Running commands, approving permissions, starting or stopping sessions or sprints.
- Writing into any project or into Claude Code's state.
- Network beyond the two opt-in features (self-update, exact context windows).
- Stopped WSL distros, remote (SSH/container) roots.
