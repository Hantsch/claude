# Changelog

All notable changes to Scrum Control. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/). Scrum Control was forked from claude-control 1.1.1 and starts
its own version history here. Notes for the next release go under `## Unreleased` - the release
workflow refuses to publish while that section is empty, and promotes it to the new version
section on release.

## Unreleased

- **Ships as an installer instead of a portable EXE.** `ScrumControl-Setup-<version>.exe` installs
  for your user only (no admin rights), to `%LOCALAPPDATA%\Programs` or a folder you choose, with
  Start menu and desktop shortcuts and an entry in *Apps & features*. Uninstalling also removes the
  autostart entry and the toast-button registration. Autostart and toast buttons now point at a
  stable path instead of the portable build's temporary unpack folder.
- **Updates through the installer.** With *Check for updates* on, Scrum Control checks once a day,
  downloads only the changed parts of the new installer in the background and verifies it. When
  the download finishes you are asked to *Install and restart*; choose Later and it installs
  quietly the next time Scrum Control quits. Settings gains *Check now* and *Install and restart*,
  the tray menu *Restart to install vX.Y.Z* while an update is waiting.

## 0.1.0 — 2026-11-18

- New app icon: Scrum Control has its own icon instead of the one inherited from claude-control.

- **A sprint and project overview across everything you have open.** Scrum Control shows, per
  project, whether an ai-scrum sprint is running, which story it is on and how far along it is,
  for every open VS Code window and every WSL session on the machine, in one place in the tray.
- **A tray icon that tells sprints from sessions.** A thin ring while no sprint runs, a disc with a
  white core while one does, an amber notched disc when a project needs you (a stalled sprint or a
  session waiting for an answer); the badge counts those
  projects and the tooltip lists the running sprints. Right-click lists the projects - choosing
  one brings its VS Code window forward - and the app's own entries, no sessions.
- **A popover of projects, not sessions.** Left-click shows the scrum projects first, one compact
  line each — the sprint's six phases by name, done ones ticked and the current one highlighted
  with, in Build, the stories done (`S23 ✓Cla ✓Ref [Build 4/6] Gate Rev Rel`), session counts, a
  `WSL` badge, a stalled sprint in amber — and every other open window or session folder below. A row unfolds into the story in
  focus with its deliverables done (`1/4 deliverables`), its sessions and a short scrum block
  (milestone, tech debt, architect). **Open window**, a clearly marked button on every row,
  brings the project's VS Code window forward.
- **A Projects tab in the main window.** Every open VS Code window is listed - ai-scrum projects
  first, all other folders under Other, with or without a Claude session; a window whose folder
  never had a Claude session is found through the folders VS Code itself records. One compact row
  per project across the full width - sprint, progress, goal, release verdict, tech debt, architect,
  sessions, trail age - lined up in columns, and under it, while a sprint runs, the phase stepper
  and, in Build, every story as a chip; a click unfolds it into the cockpit's rows (phase, release verdict, tech debt and
  architect against their limits, backlog, next sprint) and, while a sprint runs, its phase
  stepper, story chips, the story in focus and the time left. Expand all / Collapse all, and the
  unfolded rows are remembered.
  Settings gain the WSL switch and a toggle per scrum notification.
- **Notifications for the scrum events that need you.** A stalled sprint, a blocked story and a
  written release verdict (yes, NO or UNVERIFIED) raise a toast; the first scan after start only
  sets the baseline and announces nothing.
- **Session monitoring, inherited from claude-control.** Every Claude Code session on Windows and
  in WSL with its state, its context use and a one-click jump to its window - the monitor this app
  was forked from, unchanged in what it does.
- **Opt-in self-update from this repository's releases.** Off until you switch it on in Settings.
  It checks once a day for a newer `scrum-control-v<version>` release (the plugins' releases in the
  same repository are ignored), verifies the download against the release's `SHA256SUMS.txt` before
  anything is written, stages it, and swaps it in on the next start. Nothing is requested while the
  setting is off.
- **Runs side by side with claude-control.** Its own name, data folder, notification scheme and
  shortcut (`Ctrl+Alt+S`), so neither app disturbs the other.

