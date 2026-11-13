# Contributing

How this marketplace is built, tested and released. For *using* the plugins, see
[README.md](README.md); for the rules Claude follows when it edits this repository, see
[CLAUDE.md](CLAUDE.md).

## Layout

```
.claude-plugin/marketplace.json   the marketplace manifest (lists every plugin)
plugins/<name>/
  .claude-plugin/plugin.json      plugin manifest (name, version, description)
  commands/*.md                   slash commands, invoked as /<name>:<command>
  agents/*.md                     subagent definitions
  skills/<skill>/SKILL.md         skills (optional)
  output-styles/*.md              output styles, selectable in /config (optional)
  hooks/hooks.json                a mod: names its hooks module under "modules"
  hooks/*.tsx  types/index.d.ts   the module (TypeScript, no build step) and its state contract
  tests/*.test.tsx                the mod's tests, run by `claude plugin test`
  templates/*                     one-time files a plugin writes into a project (user-owned)
  templates/workflow/             managed payload: the project's own commands and agents
    commands/*.md  agents/*.md    (validated like the real thing)
  templates/skills/<group>/       managed payload: the project's own skills, grouped by stack
    <skill>/SKILL.md              (validated like the real thing)
  README.md                       at a glance: what, when, how
  REFERENCE.md                    the details (optional)
  CHANGELOG.md
scripts/validate.ps1              manifests, versions, frontmatter, shipped references
scripts/plan-release.ps1          derives the semver bump from commit messages
scripts/check-notes.ps1           refuses a push that would release without release notes
scripts/release.ps1               version bump in both manifests + changelog promotion
scripts/ci-release.ps1            release orchestration (commit, tag, push, GitHub release)
.github/workflows/validate.yml    CI on every push and PR
.github/workflows/release.yml     CI on main: releases every plugin with releasable commits
```

## Adding another plugin

1. `plugins/<name>/.claude-plugin/plugin.json` with `name`, `description`, `version`.
2. Commands as markdown files with YAML frontmatter (`description`, optional
   `argument-hint`, `model`, `effort`); agents likewise with `name`, `description`, `model`;
   skills as `skills/<name>/SKILL.md` with a trigger-shaped `description`; output styles in
   `output-styles/` with `name`, `description` and usually `keep-coding-instructions: true`; a mod
   as a hooks module named in `hooks/hooks.json`. At least one of the five has to exist.
3. Add an entry to `.claude-plugin/marketplace.json` — `name`, `source: "./plugins/<name>"`,
   `description`, `version`. The version has to match `plugin.json`; CI enforces that.
4. Reference files shipped with the plugin as `${CLAUDE_PLUGIN_ROOT}/<path>` — that variable
   points at the installed plugin directory, so absolute paths never leak into a command.
5. Add a row to the plugin table in [README.md](README.md) — name, when to use it, how to start,
   changelog link. No version: the release workflow only touches the manifests and the changelog,
   never the README.
6. Write the plugin's README for the person using it: what it is in one sentence, a picture
   (diagram or mock-up), a "when do I use what" table, install in three lines. Everything else goes
   to `REFERENCE.md`.

## Testing locally before pushing

```
/plugin marketplace add C:/development/Hantsch/claude
/plugin install <name>@hantsch
```

A local path source is picked up from the working tree, so you can iterate on a command and
re-run it without a commit. `/plugin marketplace remove hantsch` and re-adding the GitHub
source switches back.

Run the same checks CI runs:

```
pwsh -File scripts/validate.ps1
pwsh -File scripts/check-notes.ps1
```

Enable the repository hooks once per clone so the second one runs before every push:

```
git config core.hooksPath .githooks
```

## Releasing

Releases happen **automatically on merge to `main`**. Your only job while working is to write
the notes:

1. Put every change under `## Unreleased` in the plugin's `CHANGELOG.md`.
2. Commit with a Conventional-Commit prefix — that is what decides the version bump.
3. Merge to `main`. CI does the rest: version bump in both manifests, `## Unreleased` promoted
   to the new version, one `chore(release)` commit, an annotated tag `<plugin>-v<version>`, and
   a GitHub release whose notes are your changelog section plus an update hint.

### How the bump is decided

Only commits that touched `plugins/<name>/` count, and only since that plugin's last tag. The
highest level across them wins:

| Commit subject | Bump |
| --- | --- |
| `feat!: …` or `BREAKING CHANGE` in the body | **major** |
| `feat: …` | **minor** |
| `fix: …`, `perf: …`, `refactor: …`, or a plain subject | **patch** |
| `chore: …`, `docs: …`, `ci: …`, `test: …`, `style: …`, `build: …` | no release |
| anything containing `[skip release]` | no release |

Changes outside `plugins/` (the root README, this file, the scripts, the workflows) never trigger a release.

### The one rule that can fail a build

**No release without notes.** If a release would happen but `## Unreleased` is empty or still
holds a placeholder, the workflow fails with an explicit message instead of shipping an empty
version. Two ways out: write the notes, or mark the change as `chore:`/`docs:` (or add
`[skip release]`) so it is not release-worthy in the first place.

Nothing to set up for this: `secrets.GITHUB_TOKEN` is created by GitHub per workflow run, and
`permissions: contents: write` gives it the rights to push the release commit and create the
release. It does require **Settings → Actions → General → Workflow permissions = read and
write**, and no branch protection on `main` that would reject the bot's push.

### Dry run and manual escape hatches

```
pwsh -File scripts/plan-release.ps1 -Plugin ai-scrum        # what would be released, and why
pwsh -File scripts/check-notes.ps1 -Plugin ai-scrum         # ... and are its notes written?
pwsh -File scripts/ci-release.ps1 -DryRun                   # full run without commit/tag/push
pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor # bump by hand, no CI involved
```

The `release` workflow can also be started manually from the Actions tab (`workflow_dispatch`),
optionally forcing a plugin and a bump level.

## Conventions

- Everything in this repository — docs, commands, templates, commit messages — is **English**.
- Docs are written for the person using the plugin: the README answers *what, when, how* at a
  glance, with a diagram or a mock-up where it helps; the reasons and the details go to
  `REFERENCE.md`.
- Commit subjects follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `!` for
  breaking) — the release workflow reads them.
- Semver per plugin: **major** = users must change something after updating, **minor** = new
  capability, **patch** = wording/fix.
- Every plugin's `CHANGELOG.md` keeps an `## Unreleased` section at the top; a release without
  notes is refused by CI.
- A plugin never writes to `.claude/settings.json` of a project; it proposes and the user decides.
  `CLAUDE.md` is the user's too — the one exception is a block between explicit
  `<plugin>:managed:start` / `:managed:end` markers, written only after the user said yes, with
  everything outside the markers untouched.
- Every file a plugin writes into a project is either clearly plugin-owned (regenerated on
  update) or clearly user-owned (never overwritten). No third category.

