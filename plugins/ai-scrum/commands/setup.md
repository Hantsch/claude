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
can run `/refine`, `/build`, `/sprint`, `/roadmap`, `/concept`, `/release-check`, `/design-review` without installing anything.
The plugin is only needed to install or update those files — that is this command.

Plugin-owned inside the project (refreshed on update, never hand-edited):

1. `.claude/commands/{refine,build,sprint,roadmap,concept,release-check,design-review}.md` — the workflow.
2. `.claude/agents/{deliverable-hard,story-review-hard,design-reviewer,design-system-author}.md` — the two
   hard-tier agents and the two that `/design-review` starts.
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
3. **Managed files:** which of the eight workflow files exist, and does
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
   Also look for the narrow and broad gate keys (`test-story`, `e2e-story`, `e2e-all` in the
   profile template): Vitest → `test-story: npx vitest run --changed HEAD`, Jest →
   `npx jest --onlyChanged`, `pytest-picked`/`pytest-testmon` in the dependencies →
   `pytest -q --picked` / `pytest -q --testmon`, otherwise `none`; a Playwright config →
   `e2e-story: npx playwright test {files}`; a script that runs one flow by name
   (`ui:flow`, `e2e:flow`) → `npm run <script> -- {test}`; a script that runs every flow
   (`ui:flows`, `e2e:flows`) next to a separate `e2e` → `e2e-all`. No match → `none`.
5b. **Release** — the `## Release` keys of the profile template, read from the CI configuration
   and the scripts, never guessed:
   - `release-branch`: the branch a release workflow's `push` trigger names
     (`.github/workflows/*.yml` → `on.push.branches`, or the CI system's equivalent); without a
     release workflow, the branch PR workflows target; without CI, the default branch.
   - `release-plan`: a read-only script that prints the next version — `plan-release*`, a
     release script with `--print-plan` / `--plan` / `--dry-run` that only prints, `npx
     semantic-release --dry-run`, `release-please` (its PR is the plan). `release-dry-run`: the
     release script's own no-write mode (`ci-release* -DryRun`, `release.mjs --dry-run`,
     `semantic-release --dry-run`, `goreleaser release --snapshot --skip=publish`). Read the
     script's help or header to confirm the mode really writes nothing that leaves the machine
     (no commit, tag, push, upload); one you cannot confirm is not suggested. Neither → `none`.
   - `release-verify`: `auto`, unless a script already answers "will the PR and the release
     pass?" on the merge (`verify:release`, `release:check`, a `ci:local` that replays the CI
     workflows) — then that command.
   - `changelog-style`: `unreleased` when the changelog has an `Unreleased` heading, otherwise
     `version-section`.
   - `commit-style`: `conventional` when the release derives its bump from Conventional-Commit
     types — the plan script matches `feat`, `fix`, `BREAKING CHANGE` / `!:` in subjects, or the
     project uses semantic-release, release-please, standard-version, commitizen, commitlint;
     otherwise `plain`. Look at `git log --format=%s -30` too: a history that already reads
     `feat: …` is the same signal.
   - **Protection of the release branch** (only if `gh` is available and authenticated):
     `gh api repos/{owner}/{repo}/branches/<release-branch>/protection` — `404` / `Branch not
     protected` means a red PR can be merged. Reported in Phase 5; never changed.
5c. **Stage** — how far the project is, from what exists, not from what is planned:
   - the signals `/roadmap check` uses (its mode `check`, step 5, in
     `${CLAUDE_PLUGIN_ROOT}/templates/workflow/commands/roadmap.md`): `ci`, `release-workflow`, `unit-tests`,
     `e2e-config`, `tag`;
   - the detected stage: no `unit-tests` and no `ci` → `prototype`; tests but no
     `release-workflow` → `mvp`; a `release-workflow` without a `tag` → `stable`; a
     `release-workflow` and a `tag` → `live`. A fresh repository is a `prototype`;
   - **the newest solution review**: `<architecture-path>/*-solution-review.md` (default
     `docs/architecture`), written by `/solution-architect` (tech-rules). If one exists, its
     recommended stage and its profile diff (exact `key: value` lines) are the recommendation
     for every key it names — it is a decision someone already thought through, the detection
     above is only a guess.
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

**Ask about what exists, not about what is planned.** A project that has not started has no
test suite, no e2e harness and no release pipeline, and nobody can decide today which of them
runs where. Below stage `stable`, a key whose thing the survey did not find — an e2e command, a
narrow gate, a quarantine list, a release plan or dry run — is written as `none` **without a
question** and listed in the report as `dormant`: `/roadmap check` notices when the thing
appears and says so in the roadmap's `## Stage`, and the next `/ai-scrum:setup` asks about it
then. That is the one exception to "never fill in silently", and `none` is the only value it
writes.

Cover, in this order of importance:

0. **Stage** — first, because it sets the recommendation for everything after it. Offer the
   stage from step 5c with its evidence in one line ("no tests, no CI → prototype"), or the
   newest solution review's stage with its date. The four values with one line each, as in the
   profile template's comment. Then the defaults that follow from it, as the recommended answer
   of each later question:

   | key | prototype | mvp | stable | live |
   | --- | --- | --- | --- | --- |
   | `ac-tests-required` | `false` | `true` | `true` | `true` |
   | `ui-acceptance-required` (with a surface) | `false` | `false` | `core` | `core` |
   | `e2e` | `none` | `none` | the core-journey suite | the suite |
   | `release-verify` | `none` | `none` | `auto` | `auto` |
   | `release-plan`, `release-dry-run` | `none` | `none` | detected | detected |
   | sprint ends with `/release-check` | no | no | yes | yes |

   `core-journeys` is asked only from `stable` on, and only when `ui-acceptance-required` is
   `core`: a short `;`-separated list, the solution review's list as the recommendation.
   `tech-debt-limit` (10), `architect-review-every` (20) and `architecture-path`
   (`docs/architecture`) are written with their defaults without a question and named in the
   report — they are tuning, not decisions.
   **On an update** a profile without `stage` has run as `live` so far: offer the detected
   stage and `live` ("keep everything as it is") side by side, the detected one recommended
   only when it is lower and the survey shows the gates would answer `none`/`UNVERIFIED`
   anyway. A profile whose `stage` is older than the newest solution review gets the review's
   profile diff offered key by key — the user confirms each, nothing is applied unasked.
1. **Verify commands** — build/test (+ lint/typecheck if the project has them), offered as
   the detected suggestion with "correct" as the recommended option.
1b. **`e2e`** — the command that runs functional tests against the real app. Suggest a
   detected script (`test:e2e`, `e2e`, `test:integration`, a Playwright or Cypress config,
   `dotnet test --filter Category=E2E`) or `none`. Ask this separately from `test`: it is
   usually a slower, separate suite, and it is what proves acceptance criteria about user
   actions. If the project has a user-facing surface but no such suite, say so plainly in the
   report — the first sprint touching that surface has to build the harness, and until it
   exists those criteria can only be covered a level below the real path.
1c. **Narrow and broad gate** — `test-story`, `e2e-story`, `e2e-all` (see their comment in
   the profile template). `/build` runs `test-story` and `e2e-story` instead of the full
   `test`/`e2e` per story; `/sprint` runs full `test`, full `e2e` and `e2e-all` once after the
   last story. All three are optional, and `none` keeps the old behaviour: full suites per
   story. Offer the detected suggestion or `none`, bundled in one question per key. **On an
   update these are the keys an older profile lacks — offer them, never fill them in
   silently, and never replace a value the profile already has**, placeholder excepted. An
   answer left open becomes `none`. Do not offer `e2e-story` while `e2e` is `none`. When the
   flows live in `e2e-all` and `e2e` is a screen pass (screenshots + axe), offer `e2e-story`
   together with it and say why: without it `/build` falls back to the full `e2e`, which runs
   none of the flows a story's criteria are mapped to. `e2e-story-slices` (default `1`) is
   offered only when `e2e-story` is set and its runner can slice (a `--shard=i/n` or
   equivalent flag you can see in the runner or its usage line): suggest the n at which one
   slice of a full selection stays under ten minutes, and the `{shard}` placeholder for the
   `e2e-story` value; otherwise write `1` without asking. A fourth,
   optional key, `e2e-cleanup`: offer it only when `e2e` or `e2e-all` starts a desktop app or a
   server (Electron, a dev server, an emulator) — a leftover instance from a killed run is what
   makes the next run fail with "already running". Suggest the process name you can see
   (`taskkill /F /IM electron.exe` / `pkill -f electron`), say that it kills the developer's own
   instance too, default `none`.
1d. **Test support and quarantine** — `test-support` and `e2e-quarantine` (see their comment in
   the profile template). Both are optional, default `none`, one question per key. `test-support`
   is the path(s) of shared fixtures, builders and fakes that `/build` pastes into every
   deliverable prompt; suggest a folder you can see (`tests/support/`, `tests/helpers/`,
   `tests/fixtures/`, `test/utils/`), else `none`. `e2e-quarantine` is the expected-failure list
   the `e2e-all` runner reads and `/sprint`'s regression gate writes; do not offer it while
   `e2e-all` and `e2e` are both `none`, and never invent a file — if the project has no such
   list yet, `none`. **On an update these are keys an older profile lacks — offer them, never
   fill them in silently, and never replace a value the profile already has**, placeholder
   excepted. An answer left open becomes `none`.
1e. **Release** — the `## Release` keys (see their comment in the profile template), from step
   5b. They are what makes `/sprint` end releasable: it merges `release-branch` in at its start
   and, from stage `stable` on, runs `/release-check` — the merge, a clean clone, every blocking
   CI step, the release as a dry run — as its last step. Below `stable`, ask only
   `release-branch` (it decides what the sprint merges in) and write the rest per the stage
   table; `commit-style` is still asked when the survey found a Conventional-Commit signal.
   From `stable` on, ask, bundled:
   - `release-branch`, `release-plan`, `release-dry-run`: the detected values, "correct" as the
     recommended option. A project with a release workflow but no dry-run mode: say plainly
     that the release step will be reported as not run, so a due release is never `yes` — the
     fix is a dry-run flag in the release script, which is the project's to add.
   - `release-verify`: `auto` recommended. An existing project command is kept (it is the
     project's own check). **An existing `none` is asked about explicitly, with `auto` as the
     recommendation:** `none` used to mean "the short suites, and call it yes"; it now means the
     verdict is `UNVERIFIED`, never `yes` — say that, it is why two sprints in a row reported
     `releasable: yes` on PRs that then went red.
   - `commit-style`: the detected value as the recommendation, and why — with a release that
     reads Conventional-Commit types, `plain` subjects make every sprint a patch release. Say
     that it changes the subjects of every future sprint commit, not the history.
   **On an update these are keys an older profile lacks — offer them, never fill them in
   silently, never replace an existing value** (`release-verify: none` is the one value asked
   about again, as above), placeholder excepted. An answer left open takes the template's default
   (`auto`, `plain`, `none`); `release-branch` left open takes the detected branch. If the
   profile's `## Notes` already describe a sprint-end release check or a "merge main back"
   ritual by hand, say that `/sprint` now does it and that the note can go — never edit `## Notes`
   yourself.
1f. **Design** — `design-system` and `design-scan` (see their comment in the profile template).
   Only for a project with a user-facing surface; a library, CLI, service or mod gets `none` for
   both without a question. Suggest a design document you can see (`docs/design/README.md`,
   `docs/design-system*`, `DESIGN.md`, a `design` pointer in `CLAUDE.md`) and a scan you can see
   (a `design-scan` or `lint:design` script, a `tools/**/design-scan.*`), with the `{files}`
   placeholder where it takes paths; otherwise `none`. When the project has a UI and no design
   document, say so in the report and name the tech-rules skill `design-system`, which starts one
   — without it every UI story invents its own look. **On an update these are keys an older
   profile lacks — offer them, never fill them in silently, and never replace a value the profile
   already has**, placeholder excepted. An answer left open becomes `none`.
2. **Acceptance policy** — three values, and together they are this workflow's promise that a
   sprint needs no manual acceptance round:
   - `ac-tests-required` (default per stage, `true` from `mvp` on): every acceptance criterion
     is mapped to an automated test in refine and proven by it in build. `false` in a
     prototype, a spike or a throwaway project.
   - `ui-acceptance-required`: does this project have a user-facing surface whose criteria
     must be proven through it? For a library, CLI, service or mod the answer is usually no.
     If yes, `e2e` from step 1b is the command that does it — for every user-facing criterion
     (`true`) or only for those on a core journey (`core`, the default from `stable` on).
     Below `stable` it is `false` without a question: the journeys still move every sprint.
   - `manual-residue-allowed` (default `true`): may a criterion be declared unautomatable
     with a reason (an OS dialog, specific hardware, a paid external service)? `false` forces
     refine to reformulate or drop it instead. Do not ask unless the user brings it up — the
     default is right for almost everyone.
   - `testplan` (default `optional`): whether `/sprint` still writes `testplan.md`.
     `optional` = only the criteria declared as `manual residue`, and no file at all when
     there are none; `required` = the old full step-by-step plan; `off` = never.
   - **Migrating a profile older than the test mapping** (it has `live-smoke-required` /
     `live-smoke-how`): convert instead of asking twice. `live-smoke-required: true` becomes
     `ac-tests-required: true` plus `ui-acceptance-required: true`; the old `live-smoke-how`
     value is the best available hint for `e2e` — offer it converted, and drop both old keys.
     Say in the report that the manual acceptance gate (P2) is gone: stories are no longer
     held open waiting for a human to walk them, and `testplan.md` is no longer a gate.
3. **Branching** — `branch-base` (detected default branch or `dev`); `sprint-branch`: does
   `/sprint` cut its own branch from it (`true`, the default — you merge at the end) or commit
   directly on `branch-base` (`false` — typical for a private project worked on `dev`)? With
   `false`, `branch-base` must not be in `protected-branches`; say so if it is and ask which
   to change. Then whether `/sprint` may auto-commit once per story. A profile without
   `sprint-branch` gets `true` — what it did before the key existed — without asking.
4. **doc-language** — detected default; `en` for a new project.
5. **`changelog-path`** — only ask if the survey found a user-facing changelog at the repo
   root (`version.md`, `VERSION.md`, `CHANGELOG.md`): should `/build` and `/sprint` require an
   entry per user-facing change? Default `none`; leaving it unset keeps the DoD bullet dormant.
   With a path set, `changelog-style` from step 5b goes into the same question (`unreleased` /
   `version-section`, the detected one recommended): it decides where `/build` writes a note,
   and a note in the wrong section is a release with empty notes. On an update a profile with a
   `changelog-path` but no `changelog-style` gets the detected value offered, never silently.

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
- Profile keys **added** on this update, with the value each one got (`none` included), so a
  new key never appears unannounced.
- **Stage**, one line: the stage, its evidence or the solution review it came from, and the
  `dormant` keys written as `none` because their thing does not exist yet — `/roadmap check`
  will say when one of them should wake up.
- **Release readiness**, one line each: the `## Release` values, and what `/release-check` will
  not be able to check (no `release-dry-run` while a release workflow exists, a `release-verify:
  none`). If step 5b found the release branch unprotected, recommend a branch protection rule
  with the PR workflow's job as a required status check — that is the only thing that stops a
  red PR from being merged; `/release-check` and `/sprint` only report. A proposal: never call
  the API to change it.
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
