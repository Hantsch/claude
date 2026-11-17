# Contributing

Scrum Control is a fork of claude-control 1.1.1 that adds the ai-scrum view. All commands below
run from `apps/scrum-control` inside the repository.

## Documents

- [docs/CONCEPT.md](docs/CONCEPT.md) — the spec for Scrum Control; start here
- [docs/CLAUDE-CONTROL-CONCEPT.md](docs/CLAUDE-CONTROL-CONCEPT.md) — the session monitor design it
  inherits
- [docs/RESEARCH.md](docs/RESEARCH.md) — the measured facts about Claude Code's on-disk data
- [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) — where each concept section lives in the code
  and the decisions taken where the concept left a choice open
- [CHANGELOG.md](CHANGELOG.md) — what changed per release
- [CLAUDE.md](CLAUDE.md) — the project rules, including the test lanes

## Development

Node 22+ required; `.node-version` pins the version CI uses.

```powershell
cd apps/scrum-control
npm ci

npm run cli            # print the live session list and exit
npm run cli -- --watch # keep printing status changes
npm run dev            # run the tray app with hot reload
npm run package        # build release\ScrumControl-<version>-portable.exe

npm test               # vitest with fixtures, including the N2 read-only check
npm run test:perf      # non-blocking perf lane: the N4/N5 budgets
npm run typecheck      # tsc for the Node side and the renderer
npm run icons          # rebuild assets/icons from the art in output/imagegen (Python + Pillow)
```

Useful flags when starting the app from a terminal:

```powershell
ScrumControl.exe --show            # open the main window immediately
ScrumControl.exe --show history    # ...on the History tab
ScrumControl.exe --show popover    # open the tray popover
```

```
src/
├─ core/        pure TypeScript; never imports Electron
│  ├─ adapters/claude/   the only code that knows Claude Code's files and JSONL schema
│  ├─ registry/          sessions/*.json + PID/procStart liveness
│  ├─ state/             state machine, context pressure, subagent tree, aggregation
│  ├─ store/             SessionStore behind a repository interface
│  ├─ watch/             chokidar with a 250 ms trailing debounce
│  ├─ scrum/             per-project ai-scrum state, read through plugins/scrum-cockpit/hooks/scan.ts
│  └─ hosts/             Windows and WSL roots, WSL liveness and path mapping
├─ main/        Electron: tray, toasts, window focus, IPC, settings
├─ renderer/    React; a pure view, no filesystem access
├─ shared/      the IPC contract
└─ cli/         the command-line printout
```

The ai-scrum file formats are parsed by `plugins/scrum-cockpit/hooks/scan.ts`, one copy shared
with the mod and imported by relative path. A change to those formats in ai-scrum is a change to
`scan.ts`, and the mod's tests (`claude plugin test plugins/scrum-cockpit`) must still pass.

`npm test` includes the N2 check from the concept: no file's content, size or mtime changes after
a full pipeline run.

N4 (status change observed within 2 s of an append) runs in `npm run test:perf`, the non-blocking perf lane (see `CLAUDE.md`).
N5 (live tier under 2 s on a ~250 MB / 300-file tree) also runs in `npm run test:perf`.

## Test lanes

See the table in [CLAUDE.md](CLAUDE.md). On a pull request,
`.github/workflows/scrum-control-validate.yml` at the repository root runs typecheck and
`npm test`.

## Releasing

Merging into `main` releases, with no separate publish step.
`.github/workflows/scrum-control-release.yml` at the repository root runs on a push that touches
`apps/scrum-control/**`, `plugins/scrum-cockpit/hooks/scan.ts` or
`plugins/scrum-cockpit/types/index.d.ts`. It derives the version from the Conventional-Commit
subjects of the commits touching those paths since the last `scrum-control-v*` tag (`feat:` minor,
`<type>!:`/`BREAKING CHANGE` major, `chore:`/`docs:`/`ci:`/`test:`/`style:`/`build:` no release,
anything else patch), builds the portable EXE and publishes a GitHub release tagged
`scrum-control-v<version>` with the EXE and `SHA256SUMS.txt`. The notes come from the
`## Unreleased` section of [CHANGELOG.md](CHANGELOG.md); a release with an empty section fails
rather than shipping without notes. See CONCEPT §9 for the full contract.
