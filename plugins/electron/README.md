# electron

House rules for Electron apps: three skills Claude reaches for on its own, plus two files you copy
into a project once and then own yourself.

## What ships

| Item | Kind | What it does |
| --- | --- | --- |
| `skills/electron-arch/` | skill | The four layers and the trust boundary: a pure shared layer, all privilege in main, a narrow typed preload, `assertInside` path containment, the per-window security checklist (contextIsolation + sandbox, session CSP, permission deny, scheme-checked `openExternal`, navigation block, argument-array spawn, single-instance), atomic state with quarantine and append-only migrations. |
| `skills/typed-ipc/` | skill | Contract-first IPC: one channel map in the shared layer, runtime arrays with `as const satisfies` plus `Exclude<>` completeness assertions, an allowlist-checking preload bridge, a boot-time `assertContractFullyHandled()`, and the coverage test that keeps placeholder handlers out. |
| `skills/ui-verify/` | skill | Playwright `_electron` harness: seed a fixture, screenshot every screen wide and narrow, run axe-core over the same session with `serious`/`critical` as the gate. |
| `templates/launch.js` | one-time template | Env-scrubbing launcher, so `npm run dev` works inside VS Code. |
| `templates/json-store.ts` | one-time template | Atomic, self-healing JSON store: `.tmp` + rename, `.bak`, `.corrupt-<ts>` quarantine, debounced writes, ordered migrations. |

## The rules that surprise people

- **The renderer is treated as hostile**, even though it is your own code. It supplies intent, never
  authority: it asks to reveal a folder, it does not name the absolute path that may be revealed.
- **Nothing in the shared layer may import `node:*` or `electron`, or use DOM types.** That one
  constraint is what makes the layer shareable - and it is checkable.
- **Main and preload stay CommonJS.** A sandboxed preload cannot use ESM, and an `.mjs` preload races
  `contextBridge` exposure.
- **No placeholder handlers.** A channel that only throws "not implemented" looks like a finished
  feature and fails on click. The coverage test scans for it.
- **`openExternal` gets a scheme check first.** Without it you are handing the OS a target chosen by
  whatever produced that string.
- **A damaged state file is quarantined, never overwritten**, and the user is told which of
  backup/defaults they got.

## Install

```
claude plugin install electron@hantsch --scope user
```

To enable it only in the repositories where it belongs, commit an `enabledPlugins` block in that
repository's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "electron@hantsch": true
  }
}
```

The plugin never writes that file - proposing the snippet is as far as it goes.

## The two templates

These are **code, not rules**: copied once, then user-owned forever. There is no marker and no lock
file, and `/plugin update` will never touch your copy - re-copying is a deliberate manual act, and
your edits are the point.

```
cp <plugin>/templates/launch.js      scripts/launch.js
cp <plugin>/templates/json-store.ts  src/main/lib/json-store.ts
```

Then wire the launcher up in `package.json`:

```json
{
  "scripts": {
    "dev": "node scripts/launch.js electron-vite dev"
  }
}
```

Ask Claude for the plugin's installed path, or copy the file content from
`templates/launch.js` and `templates/json-store.ts` in this repository.

## Project-specific deviations

A project's own `CLAUDE.md` / `AGENTS.md` wins where it states a deliberate deviation - `sandbox:
false` for an app that genuinely needs it, a different layer naming (`src/core/` for domain logic
next to `src/shared/` for the contract). Record it there with the reason; a deviation without one is
just a violation that has been written down.
