# tech-rules

House rules that live in **your repository**, not in a plugin. `/tech-rules:setup` detects the
project's stack, writes the matching rules to `.claude/skills/`, and keeps them up to date.

## Why an installer and not a plugin with skills

A plugin is installed per user. A contributor who clones the repository and has not installed it
gets none of the rules, and nothing tells them so — the code review just gets worse. Committing the
same rules as **project skills** removes that failure mode:

- `.claude/skills/<name>/SKILL.md` is discovered automatically, for everyone, with no install, no
  marketplace and no trust dialog.
- Cloud sessions and scheduled runs load project skills from the cloned repository; user-scope
  plugins do not transfer.
- Declaring the plugin in the project's `.claude/settings.json` does **not** close the gap: a
  plugin from an external source that only the project enables is not installed automatically —
  Claude Code reports it as missing and prints the `claude plugin install` line for the contributor
  to run.

So the plugin is the *distribution channel for the maintainer*, and the repository is what every
contributor actually reads. Only whoever runs updates needs it installed.

## What ships

The rules are payload under `templates/skills/<group>/<skill>/`, grouped by stack. Setup installs
only the groups the project has, because every installed skill's description sits in the context of
every session.

| Group | Skills | Installed when |
| --- | --- | --- |
| `all` | `karpathy` | always |
| `dotnet` | `backend-guidelines`, `composition-root`, `csharp-unittest`, `dotnet-review` | a `*.sln` or `*.csproj` exists |
| `react` | `frontend-guidelines`, `design-tokens` | a `package.json` has `react` |
| `electron` | `electron-arch`, `typed-ipc`, `ui-verify` | a `package.json` has `electron`, or an electron-vite/-builder config exists |

| Skill | What it enforces |
| --- | --- |
| `karpathy` | The four behavioral rules against the recurring LLM coding mistakes: think before coding, simplicity first, surgical changes, goal-driven execution. |
| `backend-guidelines` | Layering, dependency direction, type placement and naming for modular ASP.NET Core backends, with the review checklist. |
| `composition-root` | A readable entry point: one named static registration class per concern, called by name — no authored extension methods. |
| `csharp-unittest` | Per-domain test projects, one file per use case, AAA, snake_case names, hand-written fakes, blackbox assertions. |
| `dotnet-review` | `/dotnet-review [staged\|branch\|<path>]` — reviews a C# diff against the three skills above. |
| `frontend-guidelines` | Atomic Design layering with a hard dependency direction, mandatory primitives, the duplicate scan, naming and i18n rules. |
| `design-tokens` | A semantic token layer instead of raw palette classes, dark mode, and the mobile accessibility floor. |
| `electron-arch` | The four layers and the trust boundary: privilege only in main, a pure shared layer, path containment, the per-window security checklist, quarantined state. |
| `typed-ipc` | One channel map in the shared layer that main handlers, the preload allowlist and renderer types all derive from, with boot-time and compile-time completeness checks. |
| `ui-verify` | A Playwright `_electron` harness: screenshot every screen, run axe-core in the same session, gate on `serious`/`critical`. |

Two **one-time files** ship as well and are offered only for an Electron project, only when the
target is missing: `templates/oneshot/launch.js` (env-scrubbing dev launcher, so `npm run dev`
works inside VS Code) and `templates/oneshot/json-store.ts` (atomic, self-healing JSON store with
`.bak` and quarantine). They are code: copied once, then yours forever, with no marker and no lock
entry.

## Install and run

```
claude plugin install tech-rules@hantsch --scope user
```

Then, in each project:

```
/tech-rules:setup          # install or update
/tech-rules:setup check    # report only, changes nothing
```

Setup writes:

| Path | Owner |
| --- | --- |
| `.claude/skills/<name>/SKILL.md` | plugin — refreshed on update, never hand-edit |
| `.claude/tech-rules.lock` | plugin — version, groups, and a hash per file |
| the `tech-rules:managed` block in `CLAUDE.md` | yours, block maintained with your explicit yes |
| `scripts/launch.js`, a JSON store | yours from the moment it lands |

It never writes `.claude/settings.json`, never touches `.gitignore`, never commits, and never
changes a line of `CLAUDE.md` outside its two markers.

**Commit `.claude/skills/` and `.claude/tech-rules.lock`.** That is the whole point: unless they
are in the repository, contributors do not get the rules.

## Updating, and what happens to your edits

Each installed file carries `<!-- tech-rules:managed <version> -->` and a `git hash-object` hash in
the lock. On the next `/tech-rules:setup`:

- untouched copy → overwritten silently,
- edited copy → you get the diff and decide (replace / keep; a kept file is recorded as `local` and
  left alone from then on),
- a group whose stack is gone → setup asks before deleting,
- no git → drift cannot be detected, so setup asks about every existing file.

Contributors get the rules by cloning, but not the updates: an update is a maintainer running setup
and committing the result. `/tech-rules:setup check` in CI or before a release tells you whether a
project is behind.

## What this actually enforces

Be clear about the three layers, because only one of them is enforcement:

| Layer | Mechanism | Effect |
| --- | --- | --- |
| Availability | `.claude/skills/` in the repository | every contributor has the rules, without doing anything |
| Attention | the `CLAUDE.md` block | always in context, so the right skill gets read at the right time |
| Enforcement | lint rules, tests, a `PostToolUse` hook | the only layer that stops a violation, and the only one that also works on humans |

A skill is model-invoked: it makes Claude aware, it does not gate. Setup proposes a hook snippet
when the project has a lint or typecheck script, but you paste it into `.claude/settings.json`
yourself — hooks run code, so that stays a deliberate decision.

Note two ways a rule can go quiet: a personal skill of the same name in `~/.claude/skills/` wins
over the project copy, and a contributor can mute any project skill via `skillOverrides` in their
`.claude/settings.local.json`. Setup reports the first; the second is opt-out by design.

## Project-specific deviations

A project's own `CLAUDE.md` wins where it states a deliberate deviation — `sandbox: false` for an
app that genuinely needs it, `src/core/` next to `src/shared/`, a different test framework. Record
it there with the reason. **Never edit an installed skill to fit the project**: the next update
either overwrites it or stops to ask about it, and either way the rule now exists in two versions.

## Migrating from the react, dotnet and electron plugins

Those three plugins are gone; their rules are this plugin's payload, unchanged. Per project:

1. `claude plugin install tech-rules@hantsch --scope user`
2. `/tech-rules:setup` — installs the same skills into `.claude/skills/`
3. `/plugin uninstall react@hantsch` (and `dotnet@hantsch`, `electron@hantsch`) — otherwise every
   rule sits in the listing twice, once namespaced and once as a project skill
4. commit `.claude/`

The `/dotnet:review` command is now the `dotnet-review` skill, invoked as `/dotnet-review`. The two
Electron templates moved to `templates/oneshot/` and are offered by setup; an existing copy in your
project is untouched.
