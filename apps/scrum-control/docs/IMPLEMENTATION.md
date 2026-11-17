# Implementation notes

How [CONCEPT.md](CONCEPT.md) maps onto the code, and the decisions taken where the concept
left a choice open. Written after building v1 (2026-08-05); the concept itself is unchanged
and remains the reference.

---

## 1. Where each part of the concept lives

| Concept | Code |
|---|---|
| §3 core / no Electron imports | `src/core/**` — enforced by `test/unit/boundaries.test.ts`, which scans every file under `src/core` for an Electron import (typecheck does *not* enforce this: `tsconfig.node.json` covers `core/` and `main/` in one project) |
| §3 `ClaudeAdapter` boundary | `src/core/adapters/claude/{adapter,paths,records,jsonl,tail,summarize,ide}.ts` |
| §4 registry as authoritative liveness | `src/core/registry/registry.ts`, `src/core/registry/liveness.ts` |
| §4 `ide/*.lock` privacy constraint | `src/core/adapters/claude/ide.ts` — `parseIdeLock` picks three fields by name; `authToken` is never read into a variable |
| §5.1 three tiers | live: `ClaudeAdapter.readStatus`; history index: `ClaudeAdapter.indexHistory`; detail: `ClaudeAdapter.readDetail` |
| §5.2 tail reading, window doubling | `src/core/adapters/claude/tail.ts` |
| §5.2 torn write / bookkeeping tail | `src/core/adapters/claude/jsonl.ts`, `records.ts` (`SEMANTIC_TYPES` allow-list) |
| §5.3 250 ms debounce, 5 s tick | `src/core/watch/watcher.ts`, `ControlEngine.startTick` |
| §5.4 repository seam | `src/core/store/sessionStore.ts` (`SessionRepository` + `InMemorySessionStore`) |
| §6.1/§6.2 state machine | `src/core/state/machine.ts` |
| §6.3 per-tool thresholds | `src/core/model/settings.ts` (`DEFAULT_THRESHOLDS.perToolWorkMs`) |
| §6.4 context pressure + auto-widening | `src/core/state/contextPressure.ts` |
| §6.5 tray aggregation | `src/core/state/aggregate.ts`, `src/main/tray.ts` |
| §6.6 notification discipline | `src/core/state/notifications.ts` (pure decision), `src/main/notifier.ts` (rendering) |
| §7 jump to session | `src/main/focus/{focuser,win32,processChain}.ts` |
| §8 tray popover | `src/renderer/popover.tsx`, `src/main/windows.ts` |
| §8 main window | `src/renderer/App.tsx` + `components/**` |
| §9 adapter interface | `src/core/adapters/types.ts` |
| §10 fixtures and tests | `test/fixtures/samples/**` (committed files, see `test/fixtures/README.md`), `test/fixtures/builders.ts`, `test/unit/**` |
| §11 M1 CLI | `src/cli/index.ts` |
| N3 portable EXE | `electron-builder.yml`, `npm run package` |

---

## 2. Decisions taken where the concept left a choice

### Single-instance lock — added (§12 said "Recommendation: add it in M2, awaiting your call")

`app.requestSingleInstanceLock()` in `src/main/index.ts`. A second launch focuses the
existing window instead of starting a second observer. Without it every toast would fire
twice, which defeats the purpose of the app. **Revert by deleting the guard** if you want two
instances.

### `queue-operation: "remove"` — a third operation the research did not name

§6.2 says "enqueue seen with no matching dequeue → queued". A census over all 290 real
transcripts found a third value: `enqueue` 997, `dequeue` 775, **`remove` 218** — a queued
prompt the user withdrew. Counting only enqueue/dequeue left real sessions pinned to
`queued` permanently, and `queued` is deliberately invisible to the tray colour, the badge
and the toasts, so a finished session would never announce itself.

`hasPendingQueueEntry` therefore reduces to a single question: **is the newest
`queue-operation` in the tail window an `enqueue`?** Anything else — `dequeue`, `remove`, or
a value this version has never seen — clears. A false `queued` silences the app; a missed one
costs a single toast, so the rule is deliberately biased towards "not queued".

The known cost: `enqueue A, enqueue B, dequeue A` reports "not queued" although B is still
pending. At that moment A has just started, so the session derives as `working` and `queued`
would have been suppressed anyway. Regression fixtures:
`test/fixtures/samples/.../queue-remove.jsonl` and five rows in `test/unit/machine.test.ts`,
including the `enqueue, enqueue, remove` shape that a counting-only rule gets wrong.

### Status derivation details the concept did not spell out

- **Parallel tool calls in one assistant record.** §6.2 assumes one pending call. When a
  record issues several (`Read` + `Bash` together), the machine uses the *most permissive*
  per-tool threshold of the unpaired set, so a fast tool running next to a slow one cannot
  produce a false overdue verdict — and the tool that set that threshold also decides the
  speed class, since it is the call the session is really blocked on.
- **A partially answered turn.** If the newest semantic record is a tool result but an
  earlier call of the same record is still unanswered, the session stays `working` — that is
  the literal §6.2 rule (`R.type == user → working`). Those calls are kept as
  `stalledTools` and drive the "current tool" display, but never escalate to an overdue
  state.
- **`queued` priority.** §6.2 lists `queued` without an ordering. It is applied after the
  base state and only when the session is not `working`/`waiting`/`stale`, so an enqueued
  prompt never masks a turn that is actually running — and an overdue turn is still a
  running one.
- **Nothing decays with age.** The `T_idle` rule that turned every state into `idle` is gone
  (§6.1): elapsed time produces at most one transition, `working` → `waiting` or
  `working` → `stale`, and the session stays there. Whether an old session is still worth
  showing is decided by `isTrayWorthy`, not by the state machine.
- **Speed class = budget.** `isSlowTool` is `workThresholdFor(tool) > tWorkMs` rather than a
  second hard-coded list, so the two can never disagree and the Settings sliders are the
  single knob. `Agent` (20 min) and `Workflow` (45 min) are the reason a long-running
  subagent reads `working`, and `stale` rather than `waiting` when it does go over.
- **`stop_sequence`** (36 records in the sample) is treated as output, not as a handover —
  only `end_turn` means `done`.

### Tray icon rendering

The tile is drawn in code (`src/main/tray-icons.ts`), at the exact physical size Windows asks
for, in the same `--status-*` colours the sessions list and the popover use for the same state.
The tray therefore shows the app's own status dot, not a second icon vocabulary.

Four things about it are deliberate:

- **The mark fills the box.** Windows hands the tray a fixed pixel box — 16 px per 100 % of
  display scaling — and 16 px is the whole picture, not a thumbnail of one. The mark is 80 % of
  that box; `trayPixelSize` reports the physical size and the tile is rendered at it, so nothing
  is ever resampled, and the tray is rebuilt when display scaling changes.
- **Shape as well as colour.** `done` is a filled disc, `waiting` the same disc with a notch
  bitten out of it and its halo around it (the halo `.dot.halo` draws in the window), `working` a
  disc with a white core, `none` and `stale` hollow rings — small and thin for `none`, full size
  for `stale` — and `mixed` a `working` ring around a `done` core. Amber against green is the
  pair colour vision drops first, and it is the pair the badge counts, so it does not rest on hue
  alone. `test/unit/trayTileContrast.test.ts` measures both channels on the rendered pixels.
- **Two palettes, one geometry.** `LIGHT_STATE_COLORS` mirrors `STATE_COLORS` in the light
  scheme's `--status-*` hues, dark enough to read on a light taskbar; `icon-assets.ts` picks
  between them off `nativeTheme.shouldUseDarkColors` and rebuilds on a live theme switch
  (`tray.ts`'s `retheme()`). The picture is identical either way — only the ink changes.
- **The badge is drawn onto the same bitmap** (a 3×5 pixel font composited onto Electron's
  premultiplied BGRA). It is a function of a live count, so it could never have been shipped art
  either.

The tile used to be shipped art instead: `scripts/build-icons.py` cut a generated rounded
near-black plate with a glowing ring into one PNG per state per tray size, plus a second set
inverted and re-hued for a light taskbar — 72 files. At the size the tray actually shows, the
plate ate the box and the state went with it. `npm run icons` still exists, but only for the
window icon (`app.ico`, `app.png`) and the toast logo per notifying status (`app-waiting.png`,
`app-done.png`) — art at 256 px, where art works.

### Window focus: one VS Code process, many windows

Measured while building: one VS Code process (`pid` in every `ide/*.lock`) owns **one window
per open workspace**. §7 says "focus that lock's `pid`", which is ambiguous with three
windows under one pid. `findWindowForPid` therefore takes the matched workspace folder's name
as a title hint and picks the window whose title contains it. Verified against three
concurrently open workspaces.

`koffi` is loaded lazily inside a `try`/`catch`; if it cannot load, focus falls back to
`WScript.Shell.AppActivate` via PowerShell, and the Settings → Diagnostics pane names the
backend in use. When Windows refuses foreground activation, `FlashWindowEx` flashes the
taskbar button and the UI says so rather than claiming success.

### Session labels

`aiTitle` is used as the label when present (§8). The fallback is the newest prompt, but raw
prompts contain machinery the user never typed — slash-command wrappers
(`<command-name>/goal</command-name>`), system reminders, IDE selection blocks, and Claude
Code's fixed "Caveat: …" preamble for local-command output. `cleanPromptText` strips those.

### History table wording

`finalStatus` is the state a transcript ended in, evaluated at the moment of its last record.
`working` for a session that is over means "cut off mid-turn", so the history table says
exactly that (`HISTORY_FINAL_LABEL` in `src/shared/presentation.ts`). The underlying status
vocabulary is unchanged.

### Four deviations from the §9 adapter interface

Two added methods:

- `readHistoryEntry(path)` — indexing one transcript, used when a session ends so it appears
  in history without re-walking the tree.
- `listIdeWindows()` — the window mapping is agent-specific data (`~/.claude/ide/*.lock`), so
  it belongs behind the adapter rather than in `main/`.

Two changed signatures:

- `watchRoots(): WatchRoot[]` instead of `string[]` — the watcher needs the kind of each root
  (registry / transcripts / ide) to route the event, and a depth, because
  `projects/<slug>/<id>.jsonl` is one level deeper than the other two roots.
- `readDetail(id, transcriptPath?)` — the caller usually already knows the path from the live
  session or the history entry, and passing it avoids re-scanning every project directory.

### Efficiency detail not in the concept

On every 5 s tick the engine `stat`s each live transcript and re-reads it only when size or
mtime changed; otherwise it re-derives the status from the cached facts. Elapsed-time
transitions (`working` → `waiting`, `working` → `stale`) therefore cost no file reads, which
is what keeps an all-day tray app close to idle.

### Debounce ceiling

§5.3 specifies a 250 ms trailing debounce. A pure trailing debounce can be starved: appends
arriving less than 250 ms apart keep resetting the timer, so a long active turn could delay
detection past N4's 2 s. `FileWatcher` therefore also carries a max-wait (default 1 s) — the
buffer flushes at the debounce *or* one second after the first pending event, whichever comes
first. Covered by the burst test in `test/unit/pipeline.test.ts`.

---

## 3. Requirements coverage

| # | Where |
|---|---|
| F1 live list | `ControlEngine.getSnapshot` (Sessions view) and `traySessions` (popover, tray menu) |
| F2 working / waiting / done | `core/state/machine.ts`; the two overdue cases split into `waiting` ("needs you?") and `stale` (§6.3) |
| F3 tray icon = most urgent | `trayStateFor`; `trayIconFor` adds the `done` + `working` tile; art loaded by `icon-assets.ts` |
| F4 overlay badge | `paintBadge` onto the tile in `icon-assets.ts`; empty at zero |
| F5 toast on done/waiting | `Notifier` + `NotificationGate` |
| F6 click focuses the window | `WindowFocuser`; toast click, popover row click, row double-click, detail button |
| F7 history | `indexHistory` + `InMemorySessionStore.listHistory` + History view |
| F8 project filter | `HistoryQuery.projectKey`, plus a project filter on the live list |
| F9 context pressure | `ContextWindowEstimator`, `ContextGauge` |
| F10 group by project / branch | `groupSessions`, Sessions view |
| F11 subagent tree | `buildSubagentTree`, `SubagentTree` |
| N1 local only | no network code; renderer CSP `default-src 'none'`; no `publish` target |
| N2 read-only | files opened `'r'` only; asserted by the fingerprint test in `test/unit/pipeline.test.ts` |
| N3 portable EXE | `electron-builder.yml` (`portable`, `requestExecutionLevel: user`), no autostart |
| N4 < ~2 s latency | 250 ms debounce + tail read; asserted by the latency test |
| N5 < ~2 s cold start | live tier only (~6 × 64 KB); asserted against a ~250 MB tree; measured 285 ms against the real `~/.claude` |
| N6 English | code, comments, UI |
| N7 explicit adapter boundary | `core/adapters/types.ts`, one implementation, no plugin loader |

---

## 4. Known limitations carried forward

- `waiting` remains a heuristic (§6.3), now narrowed to overdue *fast* tools so the slow-tool
  false positives land in the silent `stale` state instead. Hooks are still the designated
  upgrade path to an exact signal.
- Subagent *inner* timelines are still unavailable (`isSidechain` false everywhere), so
  `SubagentNode.children` exists but stays empty.
- The context window is still an estimate; auto-widening only ever widens.
- History lives and dies with `~/.claude/projects/` (§5.4); the repository seam is where
  SQLite would go.
- The project-slug rule is derived from observation (`[\\/:.]` → `-`). If it is ever wrong,
  transcript resolution falls back to scanning project directories for the session id, so a
  wrong slug degrades performance, not correctness.

---

## 5. WSL hosts

How CONCEPT §2 is built. One `ClaudeAdapter` per *root*, composed by `MultiRootAdapter`; the
engine still sees a single `AgentAdapter`.

| Part | Code |
|---|---|
| Root discovery (`wsl.exe -l --running -q`, UTF-16LE decode, `docker-desktop*` skipped, `/home/*/.claude` + `/root/.claude` with `sessions/` or `projects/`) | `src/core/hosts/roots.ts` — `discoverRoots` (fresh), `createRootDiscovery` (cached 60 s) |
| Path mapping | `src/core/hosts/paths.ts` — `toWindowsPath`, `toLinuxPath` |
| Liveness of a Linux pid | `src/core/hosts/wslProbe.ts` — `WslProcessProbe`, `parseProcStatStartTime` |
| Composition, routing, merge | `src/core/adapters/multiRoot.ts` |
| Wiring | `src/core/createEngine.ts` (`hostRoots()`), `wsl.enabled` in `src/core/model/settings.ts` |
| Jump to a WSL session | `src/main/focus/focuser.ts` (`focusWslSession`), `pickCodeWindow` in `win32.ts` |

Decisions:

- **Canonical Windows form of a non-drive Linux path** is `\wsl.localhost\<distro>\<path>` with
  backslashes. `normalizePathKey` folds separators, so the forward-slash form Node reads and the
  legacy `\wsl$\<distro>` host name (now also folded) share one project key.
- **The raw registry `cwd` stays on `LiveSessionRef` and `SessionView`** (it is what the slug and
  the transcript lookup need, and what "copy path" should offer a WSL terminal). The mapped path
  is `ProjectRef.path`; `ProjectRef.key` and `groupKey` derive from it.
- **`pid` of a WSL session is a Linux pid.** Everything that asks the Windows process table
  skips it: `ClaudeAdapter.readStatus` uses the distro probe, the engine's orphan rule and
  `WindowProbe.candidatePids` ignore non-Windows hosts, and the focuser never walks a chain.
- **`procStart` is compared for equality in WSL** (`ProcessProbe.stampMatches`). The Windows
  comparison tolerates one second of FILETIME ticks; applied to clock ticks since boot it would
  accept every pid.
- **A discovery failure never removes the Windows root**, and `wsl.enabled: false` skips
  `wsl.exe` altogether. Toggling the setting at run time re-discovers on the next refresh.
- **Watching.** chokidar covers the Windows root only (`MultiRootAdapter.watchRoots`). A WSL
  transcript change is found by the 5 s tick, which `stat`s every live transcript.
- **IDE locks** are read from Windows roots only: a lock in a WSL root names a Linux pid.
- **Known gap.** A distro that stops between two discoveries (up to 60 s) is still read through
  its share, which starts it again. `wsl.exe` is deliberately not run per tick to close that.

---

## 6. Scrum state

`src/core/scrum/` is the pure core behind CONCEPT §4 and the decision logic of §8. No Electron, no
writes; chokidar is the only dependency, as in `core/watch`.

| File | Job |
| --- | --- |
| `parser.ts` | The single door to the scrum-cockpit mod's `hooks/scan.ts` (relative import, bundled with the app); re-exports the functions and types the rest of `core/scrum` uses. |
| `reader.ts` | `createFsReader(configDir)`: scan.ts's `Reader` on `fs/promises`. Missing file is `null`, missing directory is `[]`; other errors throw. Listings of 64 entries or fewer carry `mtimeMs` (the trail's heartbeat); a requirements folder with hundreds of stories skips the `stat` calls. |
| `types.ts` | `ProjectScrumSummary` and the notification types and defaults. Self-contained so the renderer can import it (it is in `tsconfig.web.json`). |
| `summarize.ts` | `summarize(snapshot, { now, hasWorkingSession })`, pure. Band line, stall rule (trail silent 15 minutes or more, sprint in progress, no working session), time left at the average. |
| `events.ts` | `scrumEvents(prev, next)`, `filterByToggles`, `DEFAULT_SCRUM_NOTIFICATIONS`. |
| `monitor.ts` | `ScrumMonitor`: per-project refresh policy (add, debounced watch, 15 s or 60 s poll). Clock, timers, reader, watcher factory and scanner are injectable. |

Decisions:

- **Compiling the cross-folder import.** `tsconfig.node.json` lists `plugins/scrum-cockpit/hooks/scan.ts`
  and `types/index.d.ts`, plus `src/types/claude-code.d.ts`, an ambient stand-in for the engine's
  `Shaped<T>` that `types/index.d.ts` names. The plugin is not edited. The plugin's own `tsconfig.json`
  extends a file the engine writes (`.claude-plugin/types/tsconfig.json`, absent in a clean checkout), and
  esbuild looks up the nearest tsconfig of every file it transforms, so `vitest.config.ts` and the main and
  preload sections of `electron.vite.config.ts` pass `esbuild.tsconfigRaw` as a string, which turns that
  lookup off.
- **What counts as "the sprint".** `sprint` is the one with `status: in-progress`; a planned one is
  `nextPlanned`, a finished one in phase 4 is `releasing` (the band line shows it as
  `S09 Release 2/2 · Release check`).
- **Errors keep the last read.** A scan that throws sets `error` on the previous summary instead of blanking
  the project; a project whose first scan fails has an empty summary with `error`. `scrumEvents` skips any
  summary with an error.
- **Story durations over 12 hours are ignored** for the average and the time left: scan.ts measures
  `build · started` to `story · done` with a clock that may or may not carry the date, and a trail that mixes
  `08:30:50` with `2026-11-17 08:36` otherwise yields differences of years.
- **Watch scope.** `.claude/` and the profile's `sprints-path` (re-read after each scan), depth 3, local
  drive-letter paths only; Claude Code's own `worktrees`, `projects`, `plugins` and `todos` folders under
  `.claude/` are ignored. `.git/ai-scrum/` is not watched (the spec names two roots); a release check that
  starts is found by the next poll, within 60 seconds, then polled every 15.
- **Notification dedupe keys** are `projectKey|kind|sprintId|storyId|discriminator`. The discriminator is
  empty except for `stalled` (the trail's mtime, so a second stall after the trail moved on is a new event)
  and `releaseVerdict` (verdict kind and the check's end time).
