# Hantsch — Claude Code plugins

A public plugin marketplace for [Claude Code](https://claude.com/claude-code). Public on
purpose: no token, no auth, no clone needed to install from it.

## Plugins

| Plugin | Version | What it does |
| --- | --- | --- |
| [ai-scrum](plugins/ai-scrum/) | 1.0.0 | Spec-driven Scrum workflow — roadmap, concept interview, story refine, build with clean-agent review, autonomous sprints. All state lives in the repository. |

## Install

Add the marketplace once per machine:

```
/plugin marketplace add Hantsch/claude
```

Then install what you need:

```
/plugin install ai-scrum@hantsch
```

Update later:

```
/plugin marketplace update hantsch
/plugin update ai-scrum
```

Plugins are installed per user, so they are available in every project. Anything a project
needs on disk is created by that plugin's own setup command — for ai-scrum:

```
/ai-scrum:setup
```

## Layout

```
.claude-plugin/marketplace.json   the marketplace manifest (lists every plugin)
plugins/<name>/
  .claude-plugin/plugin.json      plugin manifest (name, version, description)
  commands/*.md                   slash commands, invoked as /<name>:<command>
  agents/*.md                     subagent definitions
  skills/<skill>/SKILL.md         skills (optional)
  templates/*                     files a plugin writes into a project
  README.md  CHANGELOG.md
scripts/validate.ps1              manifests, versions, frontmatter, shipped references
scripts/plan-release.ps1          derives the semver bump from commit messages
scripts/release.ps1               version bump in both manifests + changelog promotion
scripts/ci-release.ps1            release orchestration (commit, tag, push, GitHub release)
.github/workflows/validate.yml    CI on every push and PR
.github/workflows/release.yml     CI on main: releases every plugin with releasable commits
```

## Adding another plugin

1. `plugins/<name>/.claude-plugin/plugin.json` with `name`, `description`, `version`.
2. Commands as markdown files with YAML frontmatter (`description`, optional
   `argument-hint`, `model`, `effort`); agents likewise with `name`, `description`, `model`.
3. Add an entry to `.claude-plugin/marketplace.json` — `name`, `source: "./plugins/<name>"`,
   `description`, `version`. The version has to match `plugin.json`; CI enforces that.
4. Reference files shipped with the plugin as `${CLAUDE_PLUGIN_ROOT}/<path>` — that variable
   points at the installed plugin directory, so absolute paths never leak into a command.
5. Add a row to the table above.

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

Changes outside `plugins/` (this README, the scripts, the workflows) never trigger a release.

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
pwsh -File scripts/ci-release.ps1 -DryRun                   # full run without commit/tag/push
pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor # bump by hand, no CI involved
```

The `release` workflow can also be started manually from the Actions tab (`workflow_dispatch`),
optionally forcing a plugin and a bump level.

## Conventions

- Everything in this repository — docs, commands, templates, commit messages — is **English**.
- Commit subjects follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `!` for
  breaking) — the release workflow reads them.
- Semver per plugin: **major** = users must change something after updating, **minor** = new
  capability, **patch** = wording/fix.
- Every plugin's `CHANGELOG.md` keeps an `## Unreleased` section at the top; a release without
  notes is refused by CI.
- A plugin never writes to `CLAUDE.md` or `.claude/settings.json` of a project; it proposes and
  the user decides.
- Every file a plugin writes into a project is either clearly plugin-owned (regenerated on
  update) or clearly user-owned (never overwritten). No third category.

## License

[MIT](LICENSE)
