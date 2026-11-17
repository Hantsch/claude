# Changelog

All notable changes to Scrum Control. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/). Scrum Control was forked from claude-control 1.1.1 and starts
its own version history here. Notes for the next release go under `## Unreleased` - the release
workflow refuses to publish while that section is empty, and promotes it to the new version
section on release.

## Unreleased

- **A sprint and project overview across everything you have open.** Scrum Control shows, per
  project, whether an ai-scrum sprint is running, which story it is on and how far along it is,
  for every open VS Code window and every WSL session on the machine, in one place in the tray.
- **A tray icon that tells sprints from sessions.** A thin ring while no sprint runs, a disc with a
  white core while one does, an amber notched disc when a project needs you (a stalled sprint, a
  blocked story, a release verdict of NO, or a session waiting for an answer); the badge counts those
  projects and the tooltip lists the running sprints. Right-click lists the projects, and choosing
  one brings its VS Code window forward. A project can be hidden; a hidden project counts nowhere.
- **A popover of projects, not sessions.** Left-click shows the scrum projects first — sprint
  line, progress bar, milestone, session counts, a `WSL` badge, what needs you in amber — and the
  other projects with a running session below; a row unfolds into its sessions and a short scrum
  block, and **Open window** brings the project's VS Code window forward.
- **A Projects tab in the main window.** One card per scrum project with the cockpit's rows
  (phase, release verdict, tech debt and architect against their limits, backlog, next sprint)
  and, while a sprint runs, its phase stepper, story chips, the story in focus and the time left.
  Settings gain the WSL switch, the hidden projects and a toggle per scrum notification.
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
