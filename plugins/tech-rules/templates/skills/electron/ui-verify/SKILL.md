---
name: ui-verify
description: "Drive a built Electron app through Playwright's _electron to produce screenshots of every screen and an axe-core accessibility report, without anyone starting the app by hand. Use when: asked to verify, screenshot, smoke-test or look at the UI of an Electron app; setting up UI verification or a visual check; a story needs a live smoke test on a running app; adding an accessibility gate to CI; reviewing whether a UI change actually renders. DO NOT USE FOR: unit or component tests; web-only apps (use plain Playwright); Electron layering or IPC questions."
---

<!-- tech-rules:managed <tech-rules-version> -->

# UI Verification for Electron

A harness that starts the built app, visits every screen, writes PNGs and runs axe-core against the
same session. The point is that the UI becomes verifiable without a human starting the app - and
without touching that human's real data.

This is the concrete implementation of a live smoke test: where a workflow asks for one (ai-scrum's
`live-smoke-required` profile flag, for instance), `npm run shot` is the answer, and
`live-smoke-how` names it.

## Shape

```
scripts/
  lib/app-harness.mjs   starts the built app, scrubs the env, collects console output
  lib/screens.mjs       the screen list and how to navigate to each one
  seed.mjs              builds the demo fixture the app runs against
  shot.mjs              screenshots every screen -> .screenshots/
  a11y.mjs              axe-core over every screen -> .screenshots/a11y.json
```

Three npm scripts: `seed`, `shot`, `a11y`. `shot` and `a11y` share the harness on purpose, so "what
is in the picture" and "what axe found" are the same state. Sharing the harness *file* is not enough
for that: two runs over the same registry are two different app instances, and the report then
describes a state nobody has a picture of. Screenshot and audit belong in **one visit per screen** -
navigate, shoot, inject axe - with the entry points as filters over that one pass.

## The harness

```js
import { _electron } from 'playwright'

const MAIN_ENTRY = 'out/main/index.cjs'
const RENDERER_ENTRY = 'out/renderer/index.html'

/** A clear message instead of a Playwright stack trace when the build is missing. */
export function ensureBuild() {
  const missing = [MAIN_ENTRY, RENDERER_ENTRY].filter((p) => !existsSync(join(REPO_ROOT, p)))
  if (missing.length > 0) {
    throw new HarnessError(`Build missing (${missing.join(', ')}). Build first: npm run build`)
  }
}
```

Three Electron specifics the harness must handle:

1. **`ELECTRON_RUN_AS_NODE` has to be removed from the environment.** VS Code's extension host sets
   it and every terminal and task spawned from the editor inherits it; Electron then boots as a plain
   Node process and dies with a confusing error about `isPackaged`. The same fix belongs in the dev
   launcher; `/tech-rules:setup` offers a ready-made env-scrubbing launcher for `npm run dev`.
2. **Each run gets its own `--user-data-dir`**, pre-populated with the settings the run needs
   (window size, theme, which fixture to open, whether onboarding is done). Never let the harness
   read the user's real installation - and never let it write there.
3. **A run must not steal the keyboard focus.** `window.show()` activates and raises, and it happens
   in the main process on `ready-to-show` - so no amount of care in the harness can prevent it. The
   app has to offer `showInactive()` under the same verification flag the harness already sets:
   three lines, gated, normal launches byte-identical. Skip it and the developer cannot use the
   machine while a run is going, which ends with the verification not being run.

The fixture path and any mode flags go in through environment variables the main process prefers over
its persisted state. Then one built app can be driven into any starting state without a debug build.

## Session boundaries

**One app session per fixture variant, not per screen.** Between screens, `page.reload()`. A fresh
app only where the boot itself is the subject of the shot.

Three tiers, and the middle one is the default:

| Reset           | Cost   | What it actually clears                                          |
| --------------- | ------ | ---------------------------------------------------------------- |
| nothing         | 0      | -                                                                |
| `page.reload()` | ~0.3 s | renderer state: the store, open dialogs, focus, scroll position  |
| a new app       | ~2 s   | additionally the main process: services, caches, boot-time reads |

Relaunching per screen looks like isolation and mostly is not. It does not reset the fixture, it
**re-reads** it - so if the app persists UI state (last route, last selection), the next screen still
starts where the previous one left off, restart or no restart. State resets come from rewriting the
fixture, not from ending the process. What a relaunch does buy is a clean main process, so keep it
for exactly that:

- a screen whose subject is the cold boot (onboarding with no data, a first-run dialog, a migration
  on launch) declares that in the registry (`coldStart: true`) and gets its own app - visible in the
  registry, not hidden in the driver
- a different fixture variant is a different `--user-data-dir` and therefore a different session
- a crashed main process restarts the session and the run continues at the next screen, so error
  isolation is paid for when something is actually broken instead of on every screen

The reason this is a rule and not a preference: measured on two implementations of this skill, the
per-screen variant came to 56 launches and two minutes of stolen focus where the session variant
needs 2 launches and under 30 seconds. Nothing in the evidence differs.

Two more things a session run needs, to keep the per-screen verdict honest:

- **Attribute console output per screen**, by marking the log index before each `navigate()` and
  slicing after it. A session-wide error list is not a finding, it is a rumour.
- **Offer a screen filter** (`--screens dashboard,projects`). The fast edit/verify loop is one
  screen - and a partial run must say it is partial: no stale-renaming of images it never tried to
  write.

## The fixture

**A verification run needs realistic content, and it must be the harness's own.** Generate it
(`seed`), do not point the run at whatever the developer happens to have: a screenshot of somebody's
real data is not reviewable, cannot be diffed, and leaks.

**Write the fixture at the start of every run, not only when it is missing.** "Seed if absent" makes
run N+1 inherit run N's drift, because the app writes into that fixture while it is being verified.
The fixture is generated and costs milliseconds; rewriting it is the only thing that makes two runs
of the same build comparable.

The seed script is where a project's shape shows most, so keep it honest:

- cover the states the screens actually have - populated, empty, in-progress, overdue, error - not
  just the happy one
- if the UI ships more than one language, include content in each of them
- if the app reads something from outside itself (a directory of other tools' data, a system
  location), the seed provides its own version of that too, and the app is pointed at it. Otherwise
  the run picks up foreign content and it ends up in the screenshots.
- **the fixture also switches off what would reach outside it at boot.** A scan of the user's real
  system, a network call, an auto-updater: an empty fixture is exactly the state that triggers those,
  and the resulting modal both leaks foreign content into the screenshots and intercepts every click
  of the run.
- `ensureDemoVault`-style behaviour: if the fixture is missing when `shot` runs, build it rather than
  failing.

## Screenshots

- Two viewports minimum: wide and narrow. Resize inside the session (`win.setSize` - a BrowserWindow
  ignores `page.setViewportSize`); a viewport is not a reason for a new app. A narrow run must also
  visit the states behind a detail route, because an idle list screen reveals nothing about a detail
  column.
- Beyond the main navigation destinations, capture the states a user can get into that a route cannot
  express: a command palette open, keyboard focus visible, onboarding with no data, a secondary
  window, an error state, "nothing configured yet".
- If a screen is taller than the window, take a second shot scrolled to the end - and only then. Two
  identical images, one labelled "scrolled", is worse than one image.
- **Stale output is renamed, not left in place.** Count what this run wrote; anything else in the
  folder becomes `*.png.stale`. Otherwise the folder silently mixes two builds and nobody can tell
  from the pictures.
- **Report what could not be reached; never invent it.** A missing screen is the finding.

## The accessibility gate

`a11y.mjs` injects `axe-core` into each screen over the same harness and writes a findings report.

- **`serious` and `critical` fail the run. `minor` and `moderate` are reported and do not.** A
  threshold that fails on everything gets disabled within a week, which is worse than not having one.
- If the project has its own numeric floor - minimum hit area, contrast ratio - check it alongside
  axe by reading the value out of the stylesheet rather than hardcoding it in the script, so the gate
  and the design tokens cannot drift apart. A mouse-driven desktop app with no tap-target token has
  no such floor, and inventing one in the harness is a design decision the harness does not own.
- Write the report as JSON next to the screenshots. It is evidence for a review, not console output
  that scrolls away.

## Exit codes

Three outcomes, because a caller has to tell them apart:

- **`0`** - clean, or only `minor`/`moderate` findings.
- **`1`** - the harness or the app failed: no build, app did not start, screen unreachable, main
  process crashed, renderer console error or unhandled exception. Warnings do not fail a run.
- **`2`** - the app behaved, axe found `serious`/`critical`.

A screen that never loaded never got a chance to produce findings: record it as "unreachable, axe not
run" rather than as an empty violations list.

## Flows

Static screenshots verify that screens render; a story's acceptance steps are usually a sequence.
Expose one documented way to script one - `flows/<name>.mjs` with a default export receiving
`{ page, app, shot(label), log }` - so a story writes its own smoke on top of the harness instead of
beside it. A flow gets its own app session; there is one of them per run, so that cost does not
matter. A failing step exits non-zero naming the flow and the step.

## Procedure

1. `npm run build` - the harness runs the built app, not the dev server, so what you verify is what
   ships.
2. `npm run seed` if the fixture is missing (or let `shot` do it).
3. `npm run shot` - read the summary, then look at the PNGs. Looking is the point; a green exit code
   only means nothing crashed.
4. `npm run a11y` - fix every `serious` and `critical` finding.
5. Report what you saw per screen, and name explicitly anything you could not reach.

## Review checklist

- [ ] Runs against the built app, not the dev server
- [ ] Own `--user-data-dir` per run; the user's real data is neither read nor written
- [ ] `ELECTRON_RUN_AS_NODE` scrubbed from the environment
- [ ] The run does not take the keyboard focus; normal launches unchanged
- [ ] One session per fixture variant, `reload()` between screens, a new app only for declared
      cold-start screens and after a crash
- [ ] Fixture rewritten at the start of every run, covering empty/populated/error states - and
      switching off the boot-time side effects that would reach outside it
- [ ] Screenshot and axe come from the same visit to the screen
- [ ] Console output attributed per screen, not per session
- [ ] Wide and narrow viewports, resized inside the session; narrow also visits detail states
- [ ] Non-route states captured (palette, focus, onboarding, error, unconfigured)
- [ ] Stale images renamed, not silently kept; a partial run says it is partial
- [ ] Unreachable screens reported, not skipped quietly
- [ ] Exit codes distinguish clean / harness failure / accessibility findings
- [ ] `serious`/`critical` fail the run; the project's own numeric floor, if it has one, read from
      the stylesheet
