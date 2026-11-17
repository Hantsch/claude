# scrum-control — project rules

Windows tray app: an overview of ai-scrum sprints and Claude Code sessions across projects. A fork
of claude-control 1.1.1. The spec is [docs/CONCEPT.md](docs/CONCEPT.md); setup and contribution
flow are in [CONTRIBUTING.md](CONTRIBUTING.md). Run every command from `apps/scrum-control`.

## Test lanes

| Lane | Trigger | Runs | Blocks | Budget |
| --- | --- | --- | --- | --- |
| Story | local, before a story is done | `npm test` (whole suite) | the story | ≤ 30 s |
| PR | `.github/workflows/scrum-control-validate.yml` at the repo root | typecheck, `npm test` | the merge | `npm test` ≤ 30 s |
| Release | `.github/workflows/scrum-control-release.yml` at the repo root | when a release is due: `npm test`, then build and publish the portable EXE | the release | `npm test` ≤ 30 s; 0 s when nothing releases |
| Perf | `npm run test:perf`, local only | N4/N5 strict 2 s budgets, `fileParallelism: false` | nothing; reports | none (non-blocking) |

Budgets are targets from one local measurement; exceeding one opens a story, nothing enforces it.

A test in `npm test` never compares elapsed time against a number; a speed budget goes to
`test/perf/`, cost is proven by counting (bytes, calls).

**Flaky tests.** A test that fails and then passes on a re-run is a defect, not noise: do not
retry it into green and do not skip it silently. Fix it in the same change, or, when that is not
possible, record it as a story or follow-up and name it in the commit message.

## Rules

- **One scrum parser.** The ai-scrum file formats are parsed by
  `plugins/scrum-cockpit/hooks/scan.ts` in this repository, imported by relative path. There is
  exactly one copy; never fork it into the app. A change that must be made there is type-level
  only, and the mod's own tests (`claude plugin test plugins/scrum-cockpit`) must still pass.
- **Read-only.** The app never writes into a project or into Claude Code's state.
- **Identity.** Nothing the app writes may collide with claude-control (data dir, AppUserModelId,
  toast scheme, autostart entry, update stage) — see CONCEPT §1. Fixture paths that merely
  contain `claude-control` as a folder name are test data, not identity.
- **Network.** No outbound requests by default. The opt-in exact-context-window lookup and the
  opt-in self-update check are the only two exceptions (CONCEPT §10).
- **`core/` never imports Electron.** Electron lives in `src/main/`; the renderer is a pure view.
- **Line endings.** The app is pinned to LF by `.gitattributes`.
