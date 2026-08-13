# CLAUDE.md

Guidance for Claude Code when working **in this repository**. For how to *use* the published
plugins, see [README.md](README.md) and each plugin's own README.

## What this repository is

A public plugin marketplace for Claude Code. There is no application and no build step: the
product is markdown (commands, agents, templates) plus two JSON manifests. The PowerShell
scripts in [scripts/](scripts/) only validate and release that content.

```
.claude-plugin/marketplace.json   marketplace manifest — lists every plugin
plugins/<name>/
  .claude-plugin/plugin.json      plugin manifest (name, description, version)
  commands/*.md                   slash commands, invoked as /<name>:<command>
  agents/*.md                     subagent definitions
  output-styles/*.md              output styles, offered in the user's /config picker
  templates/*                     files the plugin writes into a consuming project
  README.md  CHANGELOG.md
scripts/*.ps1                     validate, plan-release, release, ci-release
.github/workflows/                validate (push + PR), release (push to main)
inbox/                            staging area for drafts, not shipped by any plugin
```

Two plugins: [ai-scrum](plugins/ai-scrum/) — a spec-driven Scrum workflow whose state lives
entirely in the consuming repository — and [common](plugins/common/), building blocks that are
not tied to a workflow (currently output styles).

## The one command to run

```
pwsh -File scripts/validate.ps1
```

Run it after **every** change to a manifest, command, agent or template — it is exactly what CI
runs, and it fails the release workflow too. It checks manifest validity and cross-manifest
version equality, semver, presence of README/CHANGELOG plus a `## Unreleased` section,
frontmatter on every command and agent, and that every referenced file actually ships.

## Authoring rules the validator enforces

- **Command frontmatter** needs `description`; `model` (if set) must be one of `opus`, `sonnet`,
  `haiku`, `fable`, `inherit`; `effort` (if set) one of `low`, `medium`, `high`, `xhigh`, `max`.
  `argument-hint` is free-form.
- **Agent frontmatter** needs `name` *and* `description`, and `name` must equal the file's base
  name (`agents/foo.md` → `name: foo`).
- **Output-style frontmatter** needs `description` (it is the line in the `/config` picker).
  `name` is optional and, unlike agents, *may* differ from the file name — it is the label users
  select and the value of the `outputStyle` setting. `keep-coding-instructions` and
  `force-for-plugin` must be `true`/`false` if present; a misspelled flag is silently ignored by
  Claude Code, so the validator is strict about them.
- **A plugin needs at least one of** `commands/`, `agents/`, `output-styles/`.
- **Every file a plugin references must ship.** Two patterns are scanned in all `*.md` outside
  `templates/`: `${CLAUDE_PLUGIN_ROOT}/<path>` and a bare `templates/<file>.<ext>` in prose. So
  mentioning `templates/whatever.md` in a README is a build failure unless that file exists.
- **Never use absolute paths** to plugin-shipped files. `${CLAUDE_PLUGIN_ROOT}` resolves to the
  installed plugin directory on the user's machine.
- **JSON manifests must be UTF-8 without BOM.** A BOM is a hard validation error, not something
  the tooling strips.

## Versions and releases — do not do this by hand

Releases are automatic on merge to `main`. The version fields in `plugin.json` and
`marketplace.json` are **owned by the release workflow**; bumping them in a normal commit
creates a conflict with the bot's commit and, since the two must match, likely a red build.

While working, your only job is the notes:

1. Add every user-visible change to the plugin's `CHANGELOG.md` under `## Unreleased`, as
   `- ...` bullets. That section must never be deleted — the workflow renames it into the new
   version section and leaves a fresh empty one behind.
2. Use a Conventional-Commit subject, because that is what picks the bump level:
   `feat!:`/`BREAKING CHANGE` → major, `feat:` → minor, `fix:`/`perf:`/`refactor:`/plain →
   patch, `chore:`/`docs:`/`ci:`/`test:`/`style:`/`build:` → no release. `[skip release]`
   anywhere suppresses it.
3. Only commits touching `plugins/<name>/` count for that plugin. Changes to `scripts/`,
   `.github/` or the root README never release anything — but they still need a sensible commit
   type.

**The rule that fails builds:** a release with an empty or placeholder `## Unreleased` section is
refused rather than shipped. Either write the notes or classify the commit as
`chore:`/`docs:`/`[skip release]`.

Escape hatches, all safe to run locally:

```
pwsh -File scripts/plan-release.ps1 -Plugin ai-scrum        # what would release, and why
pwsh -File scripts/ci-release.ps1 -DryRun                   # full run, no commit/tag/push
pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor # manual bump, no CI
```

`plan-release.ps1` changes nothing. `ci-release.ps1 -DryRun` *does* modify files (revert with
`git checkout -- .`).

## PowerShell constraints in scripts/

These are load-bearing, not style preferences:

- **Target PowerShell 5.1** (`#requires -Version 5.1`) even though CI uses `pwsh`. No `??`, no
  ternary, no `-AsHashtable`.
- **Keep `.ps1` files pure ASCII.** 5.1 reads a BOM-less script as ANSI, so an em dash's `0x94`
  byte is parsed as a quote and breaks the file. Emit such characters via `[char]0x2014`.
- **Write files with `[IO.File]::WriteAllText` and `UTF8Encoding($false)`**, never
  `Set-Content -Encoding UTF8` — 5.1 adds a BOM there, which then fails validation.
- Regexes over changelogs must consume `\r` explicitly (`[ \t\r]*$`), because these files are
  CRLF and .NET's `$` matches before `\n` only.

## Testing a change before pushing

```
/plugin marketplace add C:/development/Hantsch/claude
/plugin install <name>@hantsch
```

A local path source reads straight from the working tree, so command edits take effect without a
commit. Switch back with `/plugin marketplace remove hantsch` and re-adding `Hantsch/claude`.

## Conventions

- **English everywhere** — docs, commands, templates, commit messages, changelogs. Consuming
  projects may generate artifacts in another language (ai-scrum's `doc-language`), and an output
  style may *instruct* Claude to answer in one (common's `Briefing`), but nothing in this
  repository is written in one.
- Semver per plugin: major = users must change something after updating, minor = new capability,
  patch = wording/fix.
- A plugin **never writes to a project's `CLAUDE.md` or `.claude/settings.json`** — it proposes,
  the user decides.
- Every file a plugin writes into a project is either clearly plugin-owned (regenerated on
  update) or clearly user-owned (never overwritten). There is no third category.
- Project-specific facts belong in the plugin's own profile file in the consuming repo, never
  hardcoded into a command — that portability is the whole design.

## Adding a plugin

1. `plugins/<name>/.claude-plugin/plugin.json` with `name`, `description`, `version` (start at
   `1.0.0`), plus `README.md` and a `CHANGELOG.md` containing `## Unreleased` and a section for
   the current version.
2. Commands, agents and/or output styles as markdown with the frontmatter above (at least one of
   the three must exist).
3. An entry in `.claude-plugin/marketplace.json` with `name`, `source: "./plugins/<name>"`,
   `description` and a `version` identical to `plugin.json`.
4. A row in the README's plugin table.
5. `pwsh -File scripts/validate.ps1`.
