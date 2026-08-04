---
description: Installs or updates the AI Scrum structure in this project — project profile, docs scaffolding, templates — and migrates older file-based setups.
argument-hint: [check]
model: sonnet
effort: medium
---

Set up (or update) AI Scrum in this project. Argument: **$1** — `check` means
**report only, change nothing**; empty means do the work.

Everything you write is in **English**, except artifacts whose language is governed by
`doc-language` in the profile.

## What this command owns

The plugin owns the *process* (commands, agents — they live in the plugin and update with
it). This command owns only what has to exist **inside the project**:

1. `.claude/ai-scrum.md` — the project profile (facts the commands read).
2. The docs scaffolding: roadmap, requirements folder, sprints folder, concepts/systems.
3. The plugin-generated docs: `_TEMPLATE` files, workflow READMEs, `done/INDEX.md`.

It does **not** write to `CLAUDE.md`, does **not** touch `.claude/settings.json`, and
does **not** create project-specific skills.

## Phase 1 — Survey (always, also in `check`)

Establish the current state cheaply — Glob/Grep and targeted reads, do not read whole docs:

1. **Profile:** does `.claude/ai-scrum.md` exist? If yes, read it and note its
   `ai-scrum-version` → this is an **update**, not a fresh install. Existing values are
   the defaults for every question in Phase 2; do not re-ask what is already answered
   unless the value is a placeholder or obviously stale.
2. **Legacy copies:** does the project carry file copies of this workflow —
   `.claude/commands/{refine,build,sprint,roadmap,concept}.md`,
   `.claude/agents/{deliverable-hard,story-review-hard}.md`? These are the pre-plugin
   version and are now superseded by `/ai-scrum:*`. Record the exact list.
3. **Docs:** which of the paths from the profile (or their defaults) already exist, and
   what else lives in `docs/` — project-owned folders such as `wiki/`, `adr/`,
   `features/`, `design/` are **none of your business** and stay untouched.
4. **Project type**, for suggesting verify commands — first hit wins, list them all if
   several: `*.sln`/`*.csproj` → `dotnet build <sln> -c Debug --nologo` + `dotnet test`;
   `package.json` → read its `scripts` and suggest the real script names (`npm run build`,
   `npm test`, `npm run lint`, `npm run typecheck`); `pyproject.toml`/`requirements.txt` →
   `pytest -q` (+ `ruff check .` if configured); `info.json` + `*.lua` → Factorio mod,
   usually `none` for build/test; `Cargo.toml` → `cargo build` + `cargo test`;
   `go.mod` → `go build ./...` + `go test ./...`.
5. **Doc language:** if requirement/story files already exist, sample one or two and
   detect the language actually used — that is the default for `doc-language`, so an
   existing German project stays German.
6. **Git:** default branch and whether a `dev` branch exists → default for `branch-base`.

If `$1` is `check`: report the findings as a short list (profile version vs plugin
version, legacy copies found, missing scaffolding, detected verify commands, drifted
templates) and **stop**. Nothing is written.

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
   `/ai-scrum:sprint` may auto-commit once per story on the sprint branch.
4. **doc-language** — detected default; `en` for a new project.

On an update, ask only about entries that are missing, placeholders, or contradicted by
the survey. If a profile is complete and matches the survey, skip the interview entirely
and say so.

## Phase 3 — Write

Read every template from `${CLAUDE_PLUGIN_ROOT}/templates/` and write it to the project.
**Rules, without exception:**

- **Create what is missing.** Never delete or empty a folder that exists.
- **Overwrite plugin-generated files** — `_TEMPLATE.md`, `_TEMPLATE/sprint.md`,
  `docs/README.md` (only if it is a plugin-generated index — see below),
  `<requirements>/README.md`, `<sprints>/README.md`. These are the plugin's, and bringing
  them up to date is the whole point of an update. Record every overwrite for the report.
- **Never overwrite content.** Story files, sprint folders, `review.md`, `testplan.md`,
  the body of `ROADMAP.md`, existing lines in `done/INDEX.md`, and the `## Notes` section
  of the profile are the user's. If a target exists and holds content, leave it and say so.
- `docs/README.md` is special: if it exists and was **not** generated by this plugin (no
  `<!-- ai-scrum` marker in its first lines), do not touch it — instead report the one
  paragraph the user may want to paste in. If it carries the marker, refresh it but carry
  over its `## Project-specific` section verbatim.

Write, in this order:

1. `.claude/ai-scrum.md` from `templates/project-profile.md`, with the confirmed values
   filled in and `ai-scrum-version` set to this plugin's version (read it from
   `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`). On an update, carry over `## Notes`
   verbatim.
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

## Phase 4 — Migration of legacy copies

Only if Phase 1 found file copies of the workflow:

1. Show the user the exact list and explain: these are superseded by the plugin commands
   (`/ai-scrum:refine` instead of `/refine`). Where a legacy file differs from the plugin
   version in a way that looks like a **deliberate project adaptation** (a different
   verify command, an extra rule), say so explicitly — that adaptation belongs in
   `.claude/ai-scrum.md` or `CLAUDE.md`, and you offer to move it there.
2. Ask for confirmation (`AskUserQuestion`) before deleting anything. Only on an explicit
   yes: `git rm` the files (git-tracked, so recoverable) — or plain delete if untracked.
   No confirmation, no deletion.
3. Never delete anything you did not identify as a copy of this workflow. Project-specific
   commands, agents and skills stay.

## Phase 5 — Report

Short and complete:

- Profile: path, version (from → to on an update).
- Created / overwritten / left alone, as three short lists.
- Legacy copies deleted (or kept, and why).
- Placeholders still in the profile that the user has to fill in.
- The line the user may want in `CLAUDE.md` — offer it, do not write it:
  `AI Scrum: process lives in the ai-scrum plugin (/ai-scrum:*), project facts in .claude/ai-scrum.md.`
- Next step: `/ai-scrum:roadmap plan` for a fresh project, or `/ai-scrum:refine <id>`
  when stories already exist.

## Rules

- **Do not commit, do not push.** Setup writes files; the user commits deliberately.
  (Exception: the `git rm` of confirmed legacy copies is staged, not committed.)
- **Never write to `CLAUDE.md`** and never to `.claude/settings.json` — those are the
  user's files. Permissions the workflow needs (build/test) are proposed in the report.
- Idempotent: running setup twice in a row changes nothing the second time.
- If the project is not a git repository, say so and continue — only the migration step
  degrades (plain delete instead of `git rm`).
