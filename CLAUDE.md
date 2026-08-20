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
  skills/<name>/SKILL.md          skills, matched against a task by their description
  output-styles/*.md              output styles, offered in the user's /config picker
  templates/*                     files the plugin writes into a consuming project
  templates/workflow/             managed payload: the project's OWN commands/agents
    commands/*.md  agents/*.md
  templates/skills/<group>/       managed payload: the project's OWN skills, per stack group
    <skill>/SKILL.md
  README.md  CHANGELOG.md
scripts/*.ps1                     validate, plan-release, release, ci-release
.github/workflows/                validate (push + PR), release (push to main)
inbox/                            staging area for drafts, not shipped by any plugin
```

Three plugins, in two shapes:

- **Installers:** [ai-scrum](plugins/ai-scrum/) — a spec-driven Scrum workflow whose state *and
  whose commands* live in the consuming repository — and [tech-rules](plugins/tech-rules/), which
  installs the house rules for a project's stack as that project's own skills. Both register
  exactly one command, `setup`, and ship everything else as payload.
- **Direct-ship:** [common](plugins/common/) — output styles plus `premortem` and `secrets-scan`.
  Its content stays in the plugin, so `/plugin update` is the whole update story. That fits
  because these are tools for the person at the keyboard, not rules a repository has to enforce.

**Why the stack rules are payload and not plugin skills.** A plugin is installed per user, so a
contributor who never installed it gets none of the rules and nothing says so. Project skills in
`.claude/skills/` are discovered for everyone who clones, with no install and no trust dialog, and
declaring the plugin in the project's `.claude/settings.json` does not close the gap — a plugin
from an external source that only the project enables is not installed automatically. Hence the
retired `dotnet`, `react` and `electron` plugins: their rules are now tech-rules' payload. The
consequence for editing is unchanged, though — there is exactly **one** copy of a rule, the one in
`templates/skills/`. A project deviates by recording the deviation in its own `CLAUDE.md`, never by
editing its installed copy, and a rule must never be shipped in both shapes at once: a plugin skill
and a project skill of the same name both load, which doubles the context cost and the drift.

`tech-rules` additionally ships two **one-time files** (`templates/oneshot/launch.js`,
`templates/oneshot/json-store.ts`): code copied into a project once and user-owned forever. They
carry no managed marker and no lock entry — that is what separates them from the managed payload
directories.

**An installer is not a command set.** ai-scrum registers exactly one command,
`/ai-scrum:setup`. The workflow lives in `templates/workflow/{commands,agents}/` and is copied
into the consuming project as `.claude/commands/*.md` and `.claude/agents/*.md`, where it is
invoked without a namespace (`/refine 042`). Consequences when editing it: the files must be
self-contained (no `${CLAUDE_PLUGIN_ROOT}` — it does not resolve outside a plugin), they refer
to each other by project path (`.claude/commands/build.md`), and only `/ai-scrum:setup` keeps
its namespace. Setup owns them in the project: each carries an
`<!-- ai-scrum:managed <ai-scrum-version> -->` marker and a hash in `.claude/ai-scrum.lock`, so
an update replaces an untouched copy silently and asks about an edited one.

`tech-rules` works the same way, one level deeper: the payload is grouped by stack
(`templates/skills/<group>/<skill>/SKILL.md`), setup installs only the groups it detects — skill
descriptions sit in every session's context and get truncated when the listing overflows — and the
project copies live in `.claude/skills/<name>/` with `.claude/tech-rules.lock`. It also maintains a
block in the project's `CLAUDE.md` between `<!-- tech-rules:managed:start -->` and
`<!-- tech-rules:managed:end -->`, but only after an explicit yes and never a byte outside those
markers. Adding a rule to a group is dropping a folder into the payload: `setup.md` reads the
groups from disk, so it needs no edit.

## The one command to run

```
pwsh -File scripts/validate.ps1
```

Run it after **every** change to a manifest, command, agent or template — it is exactly what CI
runs, and it fails the release workflow too. It checks manifest validity and cross-manifest
version equality, semver, presence of README/CHANGELOG plus a `## Unreleased` section,
frontmatter on every command and agent, and that every referenced file actually ships.

The second command, and the one that keeps releases green:

```
pwsh -File scripts/check-notes.ps1
```

It asks the question the release workflow asks after the merge — *does every plugin whose
commits trigger a release actually have notes under `## Unreleased`?* — and answers it before
the push. It changes nothing. The **pre-push hook runs it for you** once you have enabled the
hooks in your clone:

```
git config core.hooksPath .githooks
```

That is a one-time, per-clone setting — git does not enable repository hooks by itself. Bypass
a single push with `git push --no-verify`.

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
- **Skill frontmatter** needs `description` — it is the only thing Claude matches a task
  against, so write it as trigger conditions, not as a title. A skill is a *folder*:
  `skills/<name>/SKILL.md`; a loose `skills/foo.md` is never discovered and is a validation
  error, as is a skill folder without `SKILL.md`. `name` is optional but must equal the folder
  name if present. `user-invocable` and `disable-model-invocation` must be `true`/`false` —
  same reason as the output-style flags: a misspelling is silently ignored.
- **A plugin needs at least one of** `commands/`, `agents/`, `skills/`, `output-styles/`.
- **The managed payload is validated like the real thing.** `templates/workflow/commands/*.md`
  and `.../agents/*.md` go through the same frontmatter checks (including agent `name` = file
  name), and `templates/skills/<group>/<skill>/SKILL.md` through the same skill checks (folder
  name = `name` if present, `description` present, boolean flags strict). A loose `*.md` in
  `templates/skills/` or directly in a group folder is an error, same as in a real `skills/`.
  *Every* file under either directory must carry the `<plugin>:managed <<plugin>-version>` marker
  the installer substitutes into — as `<!-- ... -->` or, for shell and YAML payload, as `# ...` —
  and must not contain `${CLAUDE_PLUGIN_ROOT}`. In a `SKILL.md` the marker goes after the closing
  `---` of the frontmatter, never before it. The directory is what separates the two template
  classes: `templates/workflow/` and `templates/skills/` are managed payload, anything else under
  `templates/` is a one-time scaffold that becomes user-owned on copy and therefore carries no
  marker.
- **Every file a plugin references must ship.** Two patterns are scanned in all `*.md` outside
  `templates/` — `SKILL.md` included: `${CLAUDE_PLUGIN_ROOT}/<path>` and a bare
  `templates/<path>.<ext>` in prose, subdirectories included. So mentioning
  `templates/whatever.md` in a README is a build failure unless that file exists.
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
pwsh -File scripts/check-notes.ps1 -Plugin ai-scrum         # ... and would it be blocked?
pwsh -File scripts/ci-release.ps1 -DryRun                   # full run, no commit/tag/push
pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor # manual bump, no CI
```

`plan-release.ps1` and `check-notes.ps1` change nothing. `ci-release.ps1 -DryRun` *does* modify
files (revert with `git checkout -- .`).

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
- A plugin **never writes to a project's `.claude/settings.json`** — it proposes, the user
  decides. That is not pedantry: hooks execute code. `CLAUDE.md` is the user's file too, with one
  narrow exception — a block between explicit `<plugin>:managed:start` / `:managed:end` markers,
  written only after the user said yes, with every line outside the markers left byte for byte.
  Maintaining that block is worth the exception because it is the pointer that gets the right skill
  read at the right time, and hand-maintaining it in every repository is exactly the drift the
  payload model exists to remove.
- **Say what is enforced.** A skill is model-invoked and `CLAUDE.md` is advisory; neither gates
  anything. Real enforcement is a lint rule, a test or a hook. A command that installs rules says
  so plainly instead of implying the rules are binding.
- Every file a plugin writes into a project is either clearly plugin-owned (regenerated on
  update) or clearly user-owned (never overwritten). There is no third category.
- Project-specific facts belong in the plugin's own profile file in the consuming repo, never
  hardcoded into a command — that portability is the whole design.

## Adding a plugin

1. `plugins/<name>/.claude-plugin/plugin.json` with `name`, `description`, `version` (start at
   `1.0.0`), plus `README.md` and a `CHANGELOG.md` containing `## Unreleased` and a section for
   the current version.
2. Commands, agents, skills and/or output styles as markdown with the frontmatter above (at
   least one of the four must exist).
3. An entry in `.claude-plugin/marketplace.json` with `name`, `source: "./plugins/<name>"`,
   `description` and a `version` identical to `plugin.json`.
4. A row in the README's plugin table — no version number there. The release workflow rewrites
   only the manifests and the changelog, so any version repeated in the root README goes stale.
5. `pwsh -File scripts/validate.ps1`.
