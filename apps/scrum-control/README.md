# Scrum Control

A Windows tray app that answers one question across every project you have open: **is a sprint
running, where does it stand, and does any project or session need me?**

It shows the [ai-scrum](../../plugins/ai-scrum/) state of each project — sprint, phase, stories,
release verdict — next to the Claude Code sessions working in it. It is a fork of
[claude-control](https://github.com/Hantsch/claude-control) and runs side by side with it.

## At a glance

Left-click the tray icon for the popover, right-click for the menu, double-click for the main
window.

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

| You want to … | Look at … |
| --- | --- |
| know whether any sprint is running | the tray tile: hollow ring = none, disc = sprint running, amber = something needs you |
| see which project needs you | the popover: amber `⚠ stalled`, `⚠ blocked`, `✗ releasable: NO` |
| see a sprint in detail | main window → **Projects** (phase stepper, stories, focus story, time left) |
| find a session and jump to it | the project row, expanded, or main window → **Sessions** |
| look back | main window → **History** |

The tray shows sprints, not sessions; sessions are the second layer underneath. Windows toasts tell
you when a session finishes or is blocked on a permission, and when a sprint starts, stalls,
blocks, reaches review or gets a release verdict — each toggle is in Settings.

Claude Code in **WSL** is supported: running distros are detected, their sessions carry a `WSL`
badge, and a WSL session in `/mnt/c/dev/X` and a Windows session in `c:\dev\X` are the same
project. Stopped distros are never touched, so nothing is booted by looking.

## Install

1. Download `ScrumControl-Setup-<version>.exe` from the
   [latest release](https://github.com/Hantsch/claude/releases/latest) of this repository (tagged
   `scrum-control-v*`).
2. Run it. It installs for your user only — no admin rights — to `%LOCALAPPDATA%\Programs` or a
   folder you choose, adds Start menu and desktop shortcuts, and starts Scrum Control in the tray.

The installer is **not code-signed**, so Windows SmartScreen shows *"Windows protected your PC"*.
Choose **More info** → **Run anyway**. Each release also ships a `SHA256SUMS.txt`:

```powershell
(Get-FileHash .\ScrumControl-Setup-0.1.0.exe -Algorithm SHA256).Hash
```

**Requirements:** Windows 10/11 and Claude Code with its state in `~/.claude` (or point the app at
another directory in Settings). The app bundles its own runtime; you do not need Node.

Settings live in `%APPDATA%\scrum-control\settings.json`. Uninstall from *Settings → Apps*; that
also removes the autostart entry and leaves your settings in place.

### Updates

Off by default. Turn on *Check for updates* in Settings and, once a day, the app checks this
repository's latest release, downloads the new installer in the background (only the changed
parts, when it can) and verifies its SHA-512. Then:

| While Scrum Control runs | What happens |
| --- | --- |
| the download finishes | you are asked: **Install and restart** or **Later** |
| you chose Later | it installs quietly the next time Scrum Control quits |
| you want it now | Settings → *Install and restart*, or the tray menu → *Restart to install vX.Y.Z* |

A failed check or download changes nothing; Settings → Diagnostics shows why.

## What it does not do

- Send prompts to sessions, approve permissions, start or stop sessions or sprints, or run any
  ai-scrum command — it is read-only and never writes into a project or into Claude Code's data
- Expose anything over the network — no listening socket, no HTTP server, no telemetry, and by
  default no outbound requests either; the optional exact-context-window lookup and the optional
  update check (both opt-in, off by default) are the two exceptions, each making its own request
  only while it is turned on
- Track cost in USD
- See stopped WSL distros or remote (SSH/container) roots
- Support agents other than Claude Code

## Known limits

The toast buttons (Jump, Mute this session) relaunch the EXE path recorded in the Windows protocol
registry when the app last registered it. Moving or deleting that EXE breaks the buttons until the
app is started once from its new location. Settings → Diagnostics shows the registered path.

## Contributing

Building from source and the release process: [CONTRIBUTING.md](CONTRIBUTING.md). The design:
[docs/CONCEPT.md](docs/CONCEPT.md).

## License

MIT — see [LICENSE](LICENSE).
