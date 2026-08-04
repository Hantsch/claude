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
scripts/release.ps1               version bump + changelog + tag
.github/workflows/validate.yml    CI: manifests, versions, frontmatter, references
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

```
pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor
```

Bumps the version in `plugin.json` **and** `marketplace.json`, opens a new section in the
plugin's `CHANGELOG.md`, and (with `-Tag`) creates the git tag `ai-scrum-v<version>`. It never
commits or pushes — review the diff, then commit yourself.

## Conventions

- Everything in this repository — docs, commands, templates, commit messages — is **English**.
- Semver per plugin: **major** = users must change something after updating, **minor** = new
  capability, **patch** = wording/fix.
- A plugin never writes to `CLAUDE.md` or `.claude/settings.json` of a project; it proposes and
  the user decides.
- Every file a plugin writes into a project is either clearly plugin-owned (regenerated on
  update) or clearly user-owned (never overwritten). No third category.

## License

[MIT](LICENSE)
