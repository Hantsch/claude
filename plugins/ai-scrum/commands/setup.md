---
description: Installs or updates the AI Scrum workflow in this project — the commands and agents themselves, the project profile and the docs scaffolding.
argument-hint: [check]
model: sonnet
effort: medium
---

Set up (or update) AI Scrum in this project. Argument: **$1** — `check` means
**report only, change nothing**; empty means do the work.

Everything you write is in **English**, except artifacts whose language is governed by
`doc-language` in the profile.

## What this command owns

The plugin ships this one command plus the workflow as **payload**. Setup copies that
payload into the project, so the workflow belongs to the repository: everyone who clones it
can run `/refine`, `/build`, `/sprint`, `/roadmap`, `/concept` without installing anything.
The plugin is only needed to install or update those files — that is this command.

Plugin-owned inside the project (refreshed on update, never hand-edited):

1. `.claude/commands/{refine,build,sprint,roadmap,concept}.md` — the workflow.
2. `.claude/agents/{deliverable-hard,story-review-hard}.md` — the two hard-tier agents.
3. `.claude/ai-scrum.lock` — version + hash per managed file, so an update can tell an
   untouched copy from one you edited.
4. The generated docs: `_TEMPLATE` files, workflow READMEs, `done/INDEX.md`.

User-owned: `.claude/ai-scrum.md` (setup writes only confirmed values, never `## Notes`),
stories, sprints, the body of `ROADMAP.md`. It does **not** write to `CLAUDE.md`, does
**not** touch `.claude/settings.json`, and does **not** create project-specific skills.

## Phase 1 — Survey (always, also in `check`)

Establish the current state cheaply — Glob/Grep and targeted reads, do not read whole docs:

1. **Plugin version:** read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` → this is the
   version you install.
2. **Profile:** does `.claude/ai-scrum.md` exist? If yes, read it and note its
   `ai-scrum-version` → this is an **update**, not a fresh install. Existing values are
   the defaults for every question in Phase 2; do not re-ask what is already answered
   unless the value is a placeholder or obviously stale.
3. **Managed files:** which of the seven workflow files exist, and does
   `.claude/ai-scrum.lock` exist? For each existing file, classify:
   - **untouched** — the lock has a hash for it and `git hash-object <path>` still matches;
   - **local** — the lock records it as `local` (you were told to keep it last time);
   - **modified/unknown** — hash differs, or there is no lock entry (that includes copies
     from the pre-plugin, file-based version of this workflow).
   No git available → every existing file is **modified/unknown**.
4. **Docs:** which of the paths from the profile (or their defaults) already exist, and
   what else lives in `docs/` — project-owned folders such as `wiki/`, `adr/`,
   `features/`, `design/` are **none of your business** and stay untouched.
5. **Project type**, for suggesting verify commands — first hit wins, list them all if
   several: `*.sln`/`*.csproj` → `dotnet build <sln> -c Debug --nologo` + `dotnet test`;
   `package.json` → read its `scripts` and suggest the real script names (`npm run build`,
   `npm test`, `npm run lint`, `npm run typecheck`); `pyproject.toml`/`requirements.txt` →
   `pytest -q` (+ `ruff check .` if configured); `info.json` + `*.lua` → Factorio mod,
   usually `none` for build/test; `Cargo.toml` → `cargo build` + `cargo test`;
   `go.mod` → `go build ./...` + `go test ./...`.
6. **Doc language:** if requirement/story files already exist, sample one or two and
   detect the language actually used — that is the default for `doc-language`, so an
   existing German project stays German.
7. **Git:** default branch and whether a `dev` branch exists → default for `branch-base`.
8. **Gitignore safety** — two checks, opposite directions, both cheap and both worth it:
   - **Must not be ignored.** Run `git check-ignore -q .claude/commands` and the same for
     `.claude/agents`, the profile and the docs paths from step 4. If `.claude/` or a docs
     folder is ignored, the workflow and the stories never reach anyone who clones the repo.
     Say so loudly in the report; it defeats the purpose of this setup.
   - **Must be ignored.** Run `git status --porcelain --untracked-files=all` and look for
     tracked or untracked generated data: build output (`out/`, `dist/`, `bin/`, `obj/`),
     dependency folders, test and screenshot artefacts, local databases, seeded fixture or
     demo-data folders, `*.local.*` and `.env*` files, per-user editor state. Name every hit
     with the `.gitignore` line that would cover it — do **not** write the file. Generated
     content committed by accident is not a formatting problem: it turns into merge conflicts
     nobody can resolve, and a seeded fixture folder can carry real content into a public
     repository.

   Report both lists even in `check` mode. This is advisory: setup never edits `.gitignore`.

If `$1` is `check`: report the findings as a short list (profile version vs plugin version,
managed files per class from step 3, missing scaffolding, detected verify commands, both
gitignore lists from step 8) and **stop**. Nothing is written.

## Phase 2 — Confirm the profile (interview)

Ask the user with `AskUserQuestion`, bundled — at most 4 questions per call, and **only
for things you could not determine or that are genuine decisions**. Never invent a value
silently; a value you could not determine goes into the profile as an explicit
`<placeholder>` and is named in the final report.

Cover, in this order of importance:

1. **Verify commands** — build/test (+ lint/typecheck if the project has them), offered as
   the detected suggestion with "correct" as the recommended option.
2. **Acceptance policy** — `ui-acceptance-required` and `live-smoke-required`: does this
   project have a user-facing surface whose acceptance must go through the real UI
   (P1/P2)? For a library, CLI or mod the answer is usually no. If yes, ask how the
   running app is driven (`live-smoke-how`).
3. **Branching** — `branch-base` (detected default branch or `dev`), and whether
   `/sprint` may auto-commit once per story on the sprint branch.
4. **doc-language** — detected default; `en` for a new project.
5. **`changelog-path`** — only ask if the survey found a user-facing changelog at the repo
   root (`version.md`, `VERSION.md`, `CHANGELOG.md`): should `/build` and `/sprint` require an
   entry per user-facing change? Default `none`; leaving it unset keeps the DoD bullet dormant.

On an update, ask only about entries that are missing, placeholders, or contradicted by
the survey. If a profile is complete and matches the survey, skip the interview entirely
and say so.

## Phase 3 — Install the workflow

Source: `${CLAUDE_PLUGIN_ROOT}/templates/workflow/commands/*.md` →
`.claude/commands/<name>.md`, and `${CLAUDE_PLUGIN_ROOT}/templates/workflow/agents/*.md` →
`.claude/agents/<name>.md`. Copy each file **verbatim**, with exactly one substitution:
`<ai-scrum-version>` in the `<!-- ai-scrum:managed ... -->` marker becomes the plugin
version from Phase 1. Never adapt the content to the project — everything project-specific
lives in `.claude/ai-scrum.md`, which these files read at runtime.

Per file, decide by its class from Phase 1:

- **missing** → write it.
- **untouched** → overwrite silently (that is what an update is for).
- **local** → leave it, and ask once whether it should now be replaced after all.
- **modified/unknown** → **never overwrite unasked.** Show what differs — prefer
  `git diff --no-index -- <project file> <plugin template>`, and if the diff is longer than
  ~30 lines describe it instead of dumping it. Then ask with `AskUserQuestion` (bundle the
  files, max 4 per call): *replace with the plugin version* / *keep mine*. Where the local
  version carries a deliberate project adaptation (a different verify command, an extra
  rule), say so explicitly — that adaptation belongs in `.claude/ai-scrum.md` or
  `CLAUDE.md`, and you offer to move it there before replacing the file.
- **Name collision** — the existing file is not a variant of this workflow at all but the
  project's own command that happens to be called `build.md`: do not diff it, do not offer
  to replace it. Report the collision and stop for that file. The workflow needs the name,
  so the user has to rename one of the two; anything else silently breaks their command.

Then write `.claude/ai-scrum.lock`, UTF-8 without BOM, one entry per managed file —
`git hash-object <path>` of what is now on disk, or the literal `"local"` for a file the
user kept:

```json
{
  "ai-scrum-version": "<plugin version>",
  "files": {
    ".claude/commands/refine.md": "<sha>",
    ".claude/agents/deliverable-hard.md": "local"
  }
}
```

Without git, write `"files": {}` and note in the report that drift detection is off, so the
next update will ask about every file.

## Phase 4 — Profile and docs scaffolding

**Rules, without exception:**

- **Create what is missing.** Never delete or empty a folder that exists.
- **Overwrite plugin-generated files** — `_TEMPLATE.md`, `_TEMPLATE/sprint.md`,
  `docs/README.md` (only if it is a plugin-generated index — see below),
  `<requirements>/README.md`, `<sprints>/README.md`. Record every overwrite for the report.
- **Never overwrite content.** Story files, sprint folders, `review.md`, `testplan.md`,
  the body of `ROADMAP.md`, existing lines in `done/INDEX.md`, and the `## Notes` section
  of the profile are the user's. If a target exists and holds content, leave it and say so.
- `docs/README.md` is special: if it exists and was **not** generated by this plugin (no
  `<!-- ai-scrum` marker in its first lines), do not touch it — instead report the one
  paragraph the user may want to paste in. If it carries the marker, refresh it but carry
  over its `## Project-specific` section verbatim.

Write, in this order:

1. `.claude/ai-scrum.md` from `${CLAUDE_PLUGIN_ROOT}/templates/project-profile.md`, with the
   confirmed values filled in and `ai-scrum-version` set to the plugin version. On an update,
   carry over `## Notes` verbatim.
2. `<roadmap-path>` from `templates/roadmap.md` — **only if it does not exist**.
2b. `docs/README.md` from `templates/docs-readme.md` — per the special rule above.
3. `<requirements-path>/` with `_TEMPLATE.md` (from `templates/requirement.md`),
   `README.md` (from `templates/requirements-readme.md`), `done/INDEX.md`
   (from `templates/requirements-done-index.md`, only if missing).
4. `<sprints-path>/` with `_TEMPLATE/sprint.md` (from `templates/sprint.md`),
   `README.md` (from `templates/sprints-readme.md`), and an empty `done/` folder
   (create it with a `.gitkeep` if the project has no sprints yet).
5. `<concepts-path>/` and `<systems-path>/` — create with a `.gitkeep` if missing.
6. Placeholders in every template (`<project name>`, paths, verify commands, language)
   are resolved from the profile — a shipped template must never reach the project with
   an unresolved placeholder, except where the template deliberately asks the *user* to
   fill something in.

Paths used in the generated files always come from the profile, so a project that maps
`requirements-path` elsewhere gets correct cross-links.

## Phase 5 — Report

Short and complete:

- Profile: path, version (from → to on an update).
- Workflow files: installed / updated / kept as three short lists, plus the lock file.
- Docs: created / overwritten / left alone.
- Placeholders still in the profile that the user has to fill in.
- **Gitignore findings** from Phase 1 step 8: what is ignored but must not be, and what should
  be ignored but is not, each with the line that would fix it. You do not write `.gitignore`.
- **Commit reminder:** `.claude/commands/`, `.claude/agents/`, `.claude/ai-scrum.md` and
  `.claude/ai-scrum.lock` only reach the team once they are committed — name the paths, do
  not commit them yourself. If `.claude/` is git-ignored, say that this must be fixed first.
- If an older ai-scrum plugin (< 2.0.0) is still installed, note that its `/ai-scrum:refine`
  and friends now duplicate the project copies — `/plugin update` removes them.
- The line the user may want in `CLAUDE.md` — offer it, do not write it:
  `AI Scrum: workflow in .claude/commands + .claude/agents, project facts in .claude/ai-scrum.md, installed/updated with /ai-scrum:setup.`
- Next step: `/roadmap plan` for a fresh project, or `/refine <id>` when stories already
  exist.

## Rules

- **Do not commit, do not push.** Setup writes files; the user commits deliberately.
- **Never write to `CLAUDE.md`** and never to `.claude/settings.json` — those are the
  user's files. Permissions the workflow needs (build/test) are proposed in the report.
- Idempotent: running setup twice in a row changes nothing the second time.
- If the project is not a git repository, say so and continue — only drift detection
  degrades (every existing workflow file is then treated as modified, so you ask).
