# Hantsch — Claude Code plugins

A public plugin marketplace for [Claude Code](https://claude.com/claude-code). Public on
purpose: no token, no auth, no clone needed to install from it.

## Plugins

| Plugin | What it does | Changes |
| --- | --- | --- |
| [ai-scrum](plugins/ai-scrum/) | Installs a spec-driven Scrum workflow into your repository — roadmap, concept interview, story refine, build with clean-agent review, autonomous sprints. Commands, agents and state live in the project; the plugin only installs and updates them. | [CHANGELOG](plugins/ai-scrum/CHANGELOG.md) |
| [tech-rules](plugins/tech-rules/) | Installs the house rules for a project's stack into the repository itself: `/tech-rules:setup` detects .NET, React and Electron, writes the matching skills to `.claude/skills/`, keeps a pointer block in `CLAUDE.md` and updates both later. | [CHANGELOG](plugins/tech-rules/CHANGELOG.md) |
| [common](plugins/common/) | Stack-agnostic building blocks: output styles **Briefing** and **KIS** for `/config`, and the `/common:premortem` and `/common:secrets-scan` commands. | [CHANGELOG](plugins/common/CHANGELOG.md) |

Two of the three are **installers**: what they ship ends up in the consuming repository, so a
contributor who never installed a plugin still gets the workflow (ai-scrum) and the house rules
(tech-rules). Only whoever installs or updates them needs the plugin. `common` is the exception —
output styles and two commands are tools for the person at the keyboard, not repository content, so
they stay in the plugin.

The former `dotnet`, `react` and `electron` plugins are gone. Their rules are tech-rules' payload,
unchanged; see [Migrating](plugins/tech-rules/README.md#migrating-from-the-react-dotnet-and-electron-plugins).

Versions are not repeated here — they are owned by the release workflow and live in
[`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json), in each plugin's
`plugin.json`, in the [releases](../../releases) and in `claude plugin list`.

## Install

Add the marketplace once per machine:

```
/plugin marketplace add Hantsch/claude
```

Then install what you need:

```
claude plugin install ai-scrum@hantsch --scope user
```

`/plugin install ai-scrum@hantsch` from inside a session does the same thing, but the
interactive flow can land you in **project** scope — which is worth avoiding, see
[Troubleshooting](#troubleshooting). The CLI form above is explicit and immune to that.

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

```
/tech-rules:setup
```

Both setups write into the project — ai-scrum the workflow (`.claude/commands/`,
`.claude/agents/`), tech-rules the house rules (`.claude/skills/`). Once that is committed,
everyone who clones the repository has it without installing anything; the plugin is only needed
to install and update those files. That is deliberate: a plugin declared in a repository's
`.claude/settings.json` is **not** installed automatically for a contributor when it comes from an
external source — Claude Code reports it as missing and prints the install command — so anything
that has to apply to everyone belongs in the repository.

## Troubleshooting

### `Unknown command: /<plugin>:<command>` — the commands never show up

Most often the plugin is installed but not *enabled*, or it is enabled with **project** scope.
Check what Claude Code actually sees:

```
claude plugin list
```

If the plugin is listed as enabled and the commands still do not exist, the likely cause is a
**Windows drive-letter case mismatch**, which hits the VS Code extension specifically:

- The extension launches its bundled binary with a lowercase drive letter as the working
  directory (`c:\path\to\project`).
- A project-scoped install records `projectPath` with an uppercase one (`C:\path\to\project`),
  because that is how the terminal reports it.
- That comparison is case-sensitive, so the install record does not match and the plugin is
  skipped — every command reports `Unknown command` and the slash-command picker says
  *No matching commands*.

The debug log is misleading here: it reports
`Plugin "<name>" not cached at ...\.claude\plugins\cache\<marketplace>\<name>\<version> — run
/plugin to refresh` even though that directory exists and is complete. Refreshing therefore
never helps, and the same plugin works fine from a terminal session, which makes it look like a
problem with the plugin's own content.

**Fix — install user-scoped**, which carries no `projectPath` and so skips the comparison:

```
claude plugin install <name>@hantsch --scope user
```

Then restart the Claude Code session in VS Code; the plugin registry is read at process start.

To confirm the diagnosis yourself, run the extension's own binary headless from a lowercase
working directory and watch the plugin lines:

```
cd /d c:\path\to\project
"%USERPROFILE%\.vscode\extensions\anthropic.claude-code-<version>-win32-x64\resources\native-binary\claude.exe" ^
  --setting-sources=user,project,local --debug --debug-to-stderr -p "say ok"
```

Broken: `Found 1 plugins (0 enabled, 1 disabled)` and `Total plugin commands loaded: 0`.
Working: `Found 2 plugins (1 enabled, ...)` and `Total plugin commands loaded: <n>`.

This is a Claude Code issue, not a plugin-authoring mistake — worth keeping in mind when a
plugin from this marketplace appears to be broken only inside the editor.

## Layout

```
.claude-plugin/marketplace.json   the marketplace manifest (lists every plugin)
plugins/<name>/
  .claude-plugin/plugin.json      plugin manifest (name, version, description)
  commands/*.md                   slash commands, invoked as /<name>:<command>
  agents/*.md                     subagent definitions
  skills/<skill>/SKILL.md         skills (optional)
  output-styles/*.md              output styles, selectable in /config (optional)
  templates/*                     files a plugin writes into a project
  templates/workflow/             managed payload: the project's own commands and agents
    commands/*.md  agents/*.md    (validated like the real thing)
  templates/skills/<group>/       managed payload: the project's own skills, grouped by stack
    <skill>/SKILL.md              (validated like the real thing)
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
   `argument-hint`, `model`, `effort`); agents likewise with `name`, `description`, `model`;
   skills as `skills/<name>/SKILL.md` with a trigger-shaped `description`; output styles in
   `output-styles/` with `name`, `description` and usually `keep-coding-instructions: true`. At
   least one of the four has to exist.
3. Add an entry to `.claude-plugin/marketplace.json` — `name`, `source: "./plugins/<name>"`,
   `description`, `version`. The version has to match `plugin.json`; CI enforces that.
4. Reference files shipped with the plugin as `${CLAUDE_PLUGIN_ROOT}/<path>` — that variable
   points at the installed plugin directory, so absolute paths never leak into a command.
5. Add a row to the table above — name, what it does, changelog link. No version: the release
   workflow only touches the manifests and the changelog, never this README.

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
- A plugin never writes to `.claude/settings.json` of a project; it proposes and the user decides.
  `CLAUDE.md` is the user's too — the one exception is a block between explicit
  `<plugin>:managed:start` / `:managed:end` markers, written only after the user said yes, with
  everything outside the markers untouched.
- Every file a plugin writes into a project is either clearly plugin-owned (regenerated on
  update) or clearly user-owned (never overwritten). No third category.

## License

[MIT](LICENSE)
