# Changelog — electron

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

## 1.0.0 — 2026-08-14

First release. Consolidates the Electron conventions that had grown in three apps in parallel, taking
the newest generation of each and folding in what the others had solved better.

### Added

- Skill **electron-arch** (`skills/electron-arch/`) — the four-layer model with a pure shared layer,
  the trust boundary (all privilege in main, narrow typed preload, validation at the boundary),
  `assertInside` path containment with the name-not-path rule, the per-window and per-session
  security checklist, atomic state with quarantine and append-only migrations, and the module
  procedure with the no-placeholder-handler rule.
- Skill **typed-ipc** (`skills/typed-ipc/`) — one contract map as the single source of truth,
  `as const satisfies` runtime arrays plus `Exclude<>` completeness assertions, the allowlist-checking
  preload bridge with the void-request trick, the typed `handle()` wrapper and boot-time
  `assertContractFullyHandled()`, and the IPC coverage test.
- Skill **ui-verify** (`skills/ui-verify/`) — Playwright `_electron` harness with its own
  `--user-data-dir` and a generated fixture, screenshots wide and narrow including non-route states,
  stale-image renaming, and an axe-core gate where `serious`/`critical` fail and `minor`/`moderate`
  only report.
- One-time template `templates/launch.js` — strips `ELECTRON_RUN_AS_NODE` so `npm run dev` behaves the
  same inside VS Code as in a normal shell.
- One-time template `templates/json-store.ts` — atomic writes via `.tmp` + rename, `.bak` of the last
  good version, `.corrupt-<timestamp>` quarantine with backup recovery, debounced and serialised
  writes, and an ordered append-only migration table.

### Where the content came from

- The newest architecture and security generation was the base; the earlier `assertInside` path
  containment was the better solution and is now the general rule. A third, older generation was
  retired rather than merged.
- The typed-IPC recipe is the contract-first one, extended with the IPC coverage meta-test and the
  no-placeholder-handler rule from the app that had been burnt by placeholders.
- `ui-verify` was genericized out of one app's harness: the fixture and seeding are now described as a
  requirement with rules, not as that app's vault.
